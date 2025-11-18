import { NotificationService } from '../notifications/NotificationService';

/**
 * Automation Workflow Service
 * Handles automated workflows and background jobs
 */

export class WorkflowService {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * New renovation enquiry workflow
   */
  async handleNewRenovationEnquiry(enquiry: any): Promise<void> {
    console.log('[WORKFLOW] New renovation enquiry:', enquiry.id);

    // 1. Send immediate confirmation to customer
    await this.notificationService.sendEmail(
      enquiry.email,
      'Thank you for your renovation enquiry',
      `We've received your enquiry and will contact you within 24 hours.`
    );

    // 2. Notify sales team
    await this.notifyTeam('sales', {
      type: 'new_renovation_enquiry',
      enquiry
    });

    // 3. Schedule follow-up reminder (24 hours)
    await this.scheduleTask('follow_up_enquiry', enquiry.id, 24 * 60 * 60);

    // 4. Check if property is in conservation area
    if (enquiry.conservationAreaWork) {
      await this.notifyTeam('conservation_specialist', {
        type: 'conservation_area_project',
        enquiry
      });
    }

    // 5. Assign project manager based on area
    await this.assignProjectManager(enquiry);
  }

  /**
   * Maintenance contract expiry workflow
   */
  async handleContractExpiry(contract: any): Promise<void> {
    console.log('[WORKFLOW] Contract expiring:', contract.id);

    const daysUntilExpiry = Math.floor(
      (new Date(contract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // 30 days before expiry: First reminder
    if (daysUntilExpiry === 30) {
      await this.notificationService.sendEmail(
        contract.customer.email,
        'Your Maintenance Contract Expires in 30 Days',
        `Your ${contract.contractType} maintenance contract expires on ${contract.endDate}.\n\n` +
        `Renew now to continue enjoying uninterrupted service and maintain your loyalty benefits.`
      );
    }

    // 14 days before expiry: Second reminder
    if (daysUntilExpiry === 14) {
      await this.notificationService.sendEmail(
        contract.customer.email,
        'Maintenance Contract Expiring Soon - Action Required',
        `Your maintenance contract expires in 14 days. Don't lose coverage!\n\n` +
        `Renew today: hampsteadrenovations.co.uk/maintenance/renew/${contract.id}`
      );

      await this.notificationService.sendSMS(
        contract.customer.phone,
        `Your maintenance contract expires in 14 days. Renew: hampsteadrenovations.co.uk/maintenance/renew/${contract.id}`
      );
    }

    // 7 days before expiry: Final reminder + call task
    if (daysUntilExpiry === 7) {
      await this.notificationService.sendEmail(
        contract.customer.email,
        '⚠️ Final Reminder: Contract Expires in 7 Days',
        `Final reminder: Your maintenance contract expires in 7 days.\n\n` +
        `We'll be calling you shortly to discuss renewal options.`
      );

      // Create task for customer service to call
      await this.createTask({
        type: 'call_customer_renewal',
        priority: 'high',
        customerId: contract.customer.id,
        contractId: contract.id,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      });
    }

    // Auto-renew if enabled
    if (contract.autoRenew && daysUntilExpiry === 0) {
      await this.processContractRenewal(contract);
    }
  }

  /**
   * Emergency response workflow
   */
  async handleEmergencyCall(emergency: any): Promise<void> {
    console.log('[WORKFLOW] Emergency call received:', emergency.id);

    // 1. Immediate dispatch
    await this.notificationService.sendEmergencyNotification(
      { email: emergency.email, phone: emergency.phone },
      emergency
    );

    // 2. Alert emergency team
    await this.alertEmergencyTeam(emergency);

    // 3. Send contractor notification
    if (emergency.assignedContractor) {
      await this.notificationService.notifyContractor(
        emergency.assignedContractor,
        {
          id: emergency.id,
          type: emergency.emergencyType,
          address: emergency.propertyAddress,
          postcode: emergency.postcode,
          urgency: 'critical',
          customerPhone: emergency.phone
        }
      );
    }

    // 4. Schedule status updates (every 15 minutes)
    await this.scheduleRecurringTask('emergency_status_update', emergency.id, 15 * 60, 4);

    // 5. Check for safety risks
    if (emergency.safetyRisk) {
      await this.alertSafetyTeam(emergency);

      // Potentially contact emergency services
      if (emergency.emergencyType === 'gas-leak') {
        await this.notifyEmergencyServices(emergency);
      }
    }

    // 6. Create follow-up task for next day
    await this.scheduleTask('emergency_follow_up', emergency.id, 24 * 60 * 60);
  }

  /**
   * Project completion workflow
   */
  async handleProjectCompletion(project: any): Promise<void> {
    console.log('[WORKFLOW] Project completed:', project.id);

    // 1. Send completion confirmation
    await this.notificationService.sendEmail(
      project.customer.email,
      `Project Completed - ${project.title}`,
      `Congratulations! Your ${project.projectType} project has been completed.\n\n` +
      `We hope you love your newly renovated space!`
    );

    // 2. Request review (3 days after completion)
    await this.scheduleTask('request_review', project.id, 3 * 24 * 60 * 60);

    // 3. Schedule final inspection (if applicable)
    if (project.buildingControlRequired) {
      await this.scheduleTask('final_inspection', project.id, 7 * 24 * 60 * 60);
    }

    // 4. Update contractor ratings
    await this.updateContractorPerformance(project);

    // 5. Generate portfolio entry
    if (project.customerConsent) {
      await this.createPortfolioEntry(project);
    }

    // 6. Calculate and award loyalty points
    await this.awardLoyaltyPoints(project.customer.id, project.actualCost);

    // 7. Schedule maintenance contract offer (30 days after)
    await this.scheduleTask('offer_maintenance_contract', project.id, 30 * 24 * 60 * 60);
  }

  /**
   * Seasonal maintenance workflow
   */
  async runSeasonalMaintenanceCampaign(season: string): Promise<void> {
    console.log('[WORKFLOW] Running seasonal campaign:', season);

    const campaigns = {
      winter: {
        subject: '🥶 Winter Property Protection - Boiler Check & Insulation',
        services: ['boiler-service', 'pipe-insulation', 'heating-check'],
        discount: 15
      },
      spring: {
        subject: '🌸 Spring Property Refresh - Exterior & Garden Prep',
        services: ['gutter-cleaning', 'exterior-painting', 'garden-prep'],
        discount: 10
      },
      summer: {
        subject: '☀️ Summer Renovation Special - Extensions & Loft Conversions',
        services: ['extension', 'loft-conversion', 'outdoor-space'],
        discount: 20
      },
      autumn: {
        subject: '🍂 Autumn Property Maintenance - Roof & Drainage',
        services: ['roof-inspection', 'gutter-clearance', 'drainage-check'],
        discount: 12
      }
    };

    const campaign = campaigns[season as keyof typeof campaigns];

    // Send to all customers in NW London
    // In production: batch send with rate limiting
    console.log(`Sending ${season} campaign: ${campaign.subject}`);
  }

  /**
   * Contractor performance monitoring
   */
  async monitorContractorPerformance(): Promise<void> {
    console.log('[WORKFLOW] Monitoring contractor performance');

    // Check all active contractors
    // - Response times
    // - Customer ratings
    // - Job completion rates
    // - No-show incidents

    // Flag underperforming contractors for review
    // Automatically promote high-performers to featured status
  }

  /**
   * Helper methods
   */
  private async notifyTeam(team: string, data: any): Promise<void> {
    console.log(`[TEAM NOTIFICATION] ${team}:`, data.type);
    // In production: send to team Slack channel, email, or dashboard
  }

  private async alertEmergencyTeam(emergency: any): Promise<void> {
    // Send to emergency response team
    // Could integrate with PagerDuty or OpsGenie
    console.log('[EMERGENCY TEAM ALERT]', emergency.severity);
  }

  private async alertSafetyTeam(emergency: any): Promise<void> {
    console.log('[SAFETY TEAM ALERT]', emergency.emergencyType);
  }

  private async notifyEmergencyServices(emergency: any): Promise<void> {
    console.log('[EMERGENCY SERVICES] Gas leak reported:', emergency.id);
    // In critical situations, could auto-call emergency services
  }

  private async scheduleTask(taskType: string, entityId: string, delaySeconds: number): Promise<void> {
    console.log(`[SCHEDULE] ${taskType} for ${entityId} in ${delaySeconds}s`);
    // In production: use BullMQ, Agenda, or AWS SQS with delay
  }

  private async scheduleRecurringTask(taskType: string, entityId: string, intervalSeconds: number, iterations: number): Promise<void> {
    console.log(`[RECURRING] ${taskType} every ${intervalSeconds}s, ${iterations} times`);
  }

  private async createTask(task: any): Promise<void> {
    console.log('[CREATE TASK]', task.type, 'priority:', task.priority);
    // Store in tasks table for team dashboard
  }

  private async processContractRenewal(contract: any): Promise<void> {
    console.log('[AUTO-RENEW]', contract.id);
    // Charge card on file and extend contract
  }

  private async assignProjectManager(enquiry: any): Promise<void> {
    // Round-robin or load-based assignment
    console.log('[ASSIGN PM] for area:', enquiry.area);
  }

  private async updateContractorPerformance(project: any): Promise<void> {
    console.log('[UPDATE PERFORMANCE] contractors on project:', project.id);
  }

  private async createPortfolioEntry(project: any): Promise<void> {
    console.log('[PORTFOLIO] Creating entry for:', project.id);
  }

  private async awardLoyaltyPoints(customerId: string, amount: number): Promise<void> {
    const points = Math.floor(amount / 10); // £1 = 1 point
    console.log(`[LOYALTY] Awarding ${points} points to customer ${customerId}`);
  }
}

export default WorkflowService;
