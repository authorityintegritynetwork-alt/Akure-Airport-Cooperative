import app from "./app";
import { logger } from "./lib/logger";
import { seedOrganizations } from "./lib/seedOrganizations";
import { seedLoanProducts } from "./lib/seedLoanProducts";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap() {
  try {
    await seedOrganizations();
    await seedLoanProducts();
  } catch (err) {
    logger.error({ err }, "Failed to seed organizations on startup");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void bootstrap();
