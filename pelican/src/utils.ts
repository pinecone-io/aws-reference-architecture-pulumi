export default function checkEnvVars() {
  const requiredEnvVars = [
    "POSTGRES_DB_USER",
    "POSTGRES_DB_HOST",
    "POSTGRES_DB_NAME",
    "POSTGRES_DB_PASSWORD",
    "POSTGRES_DB_PORT",
    "AWS_REGION",
    "SQS_QUEUE_URL",
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar],
  );

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    );
  }
}
