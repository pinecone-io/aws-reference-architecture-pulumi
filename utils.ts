export default function checkEnvVars() {
  const requiredEnvVars = [
    "PINECONE_API_KEY",
    "PINECONE_ENVIRONMENT",
    "PINECONE_INDEX",
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
