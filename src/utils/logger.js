import pino from 'pino';
import config from '../config.js';

const logger = pino({
  level: config.logLevel,
  ...(process.stdout.isTTY && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export default logger;
