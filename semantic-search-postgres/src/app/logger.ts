import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DDTHH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [new transports.Console()],
});

export default logger;
