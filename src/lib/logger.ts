import winston from 'winston';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json() // Production logs should be JSON for observability tools
  ),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' 
        ? combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), devFormat)
        : json(),
    }),
  ],
});

// Wrapper for consistent usage
export const log = {
  info: (message: string, meta?: object) => logger.info(message, meta),
  error: (message: string, error?: any) => {
    const meta = error instanceof Error 
      ? { error: { message: error.message, stack: error.stack, ...error } }
      : { error };
    logger.error(message, meta);
  },
  warn: (message: string, meta?: object) => logger.warn(message, meta),
  debug: (message: string, meta?: object) => logger.debug(message, meta),
};
