#!/bin/bash

# Setup script for PostgreSQL read replicas
# This script configures PostgreSQL replication for the NW London Local Ledger

set -e

echo "========================================="
echo "NW London Local Ledger - Read Replica Setup"
echo "========================================="

# Configuration variables
PRIMARY_PORT=${DB_PRIMARY_PORT:-5432}
REPLICA1_PORT=${DB_REPLICA1_PORT:-5433}
REPLICA2_PORT=${DB_REPLICA2_PORT:-5434}
REPLICA3_PORT=${DB_REPLICA3_PORT:-5435}
DB_NAME=${DB_NAME:-nw_london_local}
DB_USER=${DB_USER:-postgres}
PGDATA_BASE="/var/lib/postgresql/data"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as appropriate user
if [ "$EUID" -eq 0 ]; then
   print_error "Please do not run this script as root"
   exit 1
fi

# Step 1: Configure Primary for Replication
configure_primary() {
    print_status "Configuring primary database for replication..."

    # Update postgresql.conf for primary
    cat << EOF > /tmp/primary_replication.conf
# Replication Configuration
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_segments = 64
hot_standby = on
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/archive/%f && cp %p /var/lib/postgresql/archive/%f'
synchronous_commit = on
synchronous_standby_names = 'replica1,replica2,replica3'

# Performance settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 4MB
max_connections = 200
checkpoint_segments = 16
checkpoint_completion_target = 0.9

# Logging
log_replication_commands = on
log_connections = on
log_disconnections = on
EOF

    print_status "Primary configuration created"
}

# Step 2: Create Replication Slots
create_replication_slots() {
    print_status "Creating replication slots..."

    psql -p $PRIMARY_PORT -U $DB_USER -d $DB_NAME << EOF
SELECT * FROM pg_create_physical_replication_slot('replica1_slot');
SELECT * FROM pg_create_physical_replication_slot('replica2_slot');
SELECT * FROM pg_create_physical_replication_slot('replica3_slot');
EOF

    print_status "Replication slots created"
}

# Step 3: Create Replica Instances
create_replica() {
    local REPLICA_NAME=$1
    local REPLICA_PORT=$2
    local REPLICA_DATA_DIR="${PGDATA_BASE}_${REPLICA_NAME}"

    print_status "Creating replica: $REPLICA_NAME on port $REPLICA_PORT..."

    # Stop replica if running
    pg_ctl -D $REPLICA_DATA_DIR stop 2>/dev/null || true

    # Remove old data directory if exists
    if [ -d "$REPLICA_DATA_DIR" ]; then
        print_warning "Removing existing replica data directory..."
        rm -rf $REPLICA_DATA_DIR
    fi

    # Create base backup
    pg_basebackup -h localhost -p $PRIMARY_PORT -U $DB_USER -D $REPLICA_DATA_DIR -Fp -Xs -R -P

    # Configure replica
    cat << EOF > $REPLICA_DATA_DIR/postgresql.conf
# Replica Configuration
port = $REPLICA_PORT
hot_standby = on
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB

# Replication
primary_conninfo = 'host=localhost port=$PRIMARY_PORT user=$DB_USER application_name=$REPLICA_NAME'
primary_slot_name = '${REPLICA_NAME}_slot'
hot_standby_feedback = on

# Performance
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
EOF

    # Create standby.signal file (PostgreSQL 12+)
    touch $REPLICA_DATA_DIR/standby.signal

    # Start replica
    pg_ctl -D $REPLICA_DATA_DIR start

    # Wait for replica to connect
    sleep 5

    # Verify replication
    psql -p $PRIMARY_PORT -U $DB_USER -d $DB_NAME -c "SELECT application_name, state, sync_state FROM pg_stat_replication WHERE application_name='$REPLICA_NAME';"

    print_status "Replica $REPLICA_NAME created and running"
}

# Step 4: Setup PgBouncer
setup_pgbouncer() {
    print_status "Setting up PgBouncer..."

    # Create PgBouncer directories
    sudo mkdir -p /etc/pgbouncer /var/log/pgbouncer /var/run/pgbouncer

    # Copy configuration
    sudo cp ../config/pgbouncer.ini /etc/pgbouncer/

    # Create userlist.txt
    echo "\"$DB_USER\" \"md5$(echo -n "${DB_PASSWORD}${DB_USER}" | md5sum | cut -d' ' -f1)\"" | sudo tee /etc/pgbouncer/userlist.txt

    # Create systemd service if not exists
    if [ ! -f /etc/systemd/system/pgbouncer.service ]; then
        cat << EOF | sudo tee /etc/systemd/system/pgbouncer.service
[Unit]
Description=PgBouncer connection pooler
After=network.target

[Service]
Type=forking
User=postgres
Group=postgres
ExecStart=/usr/bin/pgbouncer -d /etc/pgbouncer/pgbouncer.ini
ExecReload=/bin/kill -HUP \$MAINPID
PIDFile=/var/run/pgbouncer/pgbouncer.pid
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
    fi

    # Start PgBouncer
    sudo systemctl daemon-reload
    sudo systemctl enable pgbouncer
    sudo systemctl restart pgbouncer

    print_status "PgBouncer configured and started"
}

# Step 5: Verify Setup
verify_setup() {
    print_status "Verifying replication setup..."

    # Check replication status
    psql -p $PRIMARY_PORT -U $DB_USER -d $DB_NAME << EOF
SELECT
    application_name,
    client_addr,
    state,
    sync_state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes
FROM pg_stat_replication
ORDER BY application_name;
EOF

    # Test each replica
    for port in $REPLICA1_PORT $REPLICA2_PORT $REPLICA3_PORT; do
        print_status "Testing replica on port $port..."
        psql -p $port -U $DB_USER -d $DB_NAME -c "SELECT pg_is_in_recovery();"
    done

    # Test PgBouncer
    print_status "Testing PgBouncer..."
    psql -h localhost -p 6432 -U $DB_USER -d nw_london_primary -c "SELECT 1;"

    print_status "Setup verification complete"
}

# Step 6: Create monitoring user
create_monitoring_user() {
    print_status "Creating monitoring user..."

    psql -p $PRIMARY_PORT -U $DB_USER -d $DB_NAME << EOF
CREATE USER monitoring WITH PASSWORD 'monitoring_password';
GRANT pg_monitor TO monitoring;
GRANT CONNECT ON DATABASE $DB_NAME TO monitoring;
EOF

    print_status "Monitoring user created"
}

# Main execution
main() {
    echo
    print_status "Starting replica setup process..."
    echo

    # Check prerequisites
    command -v psql >/dev/null 2>&1 || { print_error "psql is required but not installed."; exit 1; }
    command -v pg_basebackup >/dev/null 2>&1 || { print_error "pg_basebackup is required but not installed."; exit 1; }
    command -v pgbouncer >/dev/null 2>&1 || print_warning "pgbouncer is not installed. Skipping PgBouncer setup."

    # Execute setup steps
    configure_primary
    create_replication_slots
    create_replica "replica1" $REPLICA1_PORT
    create_replica "replica2" $REPLICA2_PORT
    create_replica "replica3" $REPLICA3_PORT

    if command -v pgbouncer >/dev/null 2>&1; then
        setup_pgbouncer
    fi

    create_monitoring_user
    verify_setup

    echo
    print_status "========================================="
    print_status "Read replica setup completed successfully!"
    print_status "========================================="
    echo
    echo "Next steps:"
    echo "1. Copy .env.replica.example to .env and update with your values"
    echo "2. Update your application to use the new connection settings"
    echo "3. Monitor replication lag using the replication monitor"
    echo "4. Test failover scenarios"
    echo
}

# Run main function
main "$@"