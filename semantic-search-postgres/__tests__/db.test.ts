import { query } from '../src/utils/db';

jest.mock('pg', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  const mockRelease = jest.fn();
  const mockConnect = jest.fn().mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });
  return {
    Pool: jest.fn(() => ({
      connect: mockConnect,
    })),
  };
});

describe('db util', () => {
  // Set environment variables as needed
  beforeAll(() => {
    process.env.POSTGRES_DB_HOST = 'localhost';
    process.env.POSTGRES_DB_NAME = 'default';
    process.env.POSTGRES_DB_PORT = '5432';
    process.env.POSTGRES_DB_USER = 'postgres';
    process.env.POSTGRES_DB_PASSWORD = 'password';
  });

  it('should execute query correctly', async () => {
    const text = 'SELECT * FROM users;';
    await query(text);

    const mockPool = require('pg').Pool;
    const poolInstance = new mockPool();
    const client = await poolInstance.connect();

    expect(client.query).toHaveBeenCalledWith(text, undefined);
    expect(client.release).toHaveBeenCalled();
  });
});

