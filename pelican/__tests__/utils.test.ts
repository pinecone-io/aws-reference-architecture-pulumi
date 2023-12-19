import checkEnvVars from '../src/utils'

describe('checkEnvVars utility function', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules(); // Clears any cache between tests.
    process.env = { ...originalEnv }; // Reset to original environment variables before each test.
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original environment after all tests are done.
  });

  it('should not throw an error when all required environment variables are set', () => {
    process.env.POSTGRES_DB_USER = 'user';
    process.env.POSTGRES_DB_HOST = 'localhost';
    process.env.POSTGRES_DB_NAME = 'dbname';
    process.env.POSTGRES_DB_PASSWORD = 'password';
    process.env.POSTGRES_DB_PORT = '5432';
    process.env.AWS_REGION = 'us-west-1';
    process.env.SQS_QUEUE_URL = 'http://example.com/sqs';

    expect(() => checkEnvVars()).not.toThrow();
  });

  it('should throw an error when a required environment variable is missing', () => {
    delete process.env.POSTGRES_DB_USER; // Removing one required variable for the test.

    expect(() => checkEnvVars()).toThrow(
      'Missing required environment variables: POSTGRES_DB_USER'
    );
  });
});

