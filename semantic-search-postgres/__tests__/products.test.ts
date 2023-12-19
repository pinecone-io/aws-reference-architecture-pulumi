import { POST as handler } from '../src/app/api/products/route';
import { NextResponse } from 'next/server';
import { query } from '../src/utils/db';

import { getPinecone } from '../src/app/api/products/pinecone';
import logger from '../src/app/logger';

jest.mock('../src/utils/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../src/app/api/products/pipeline', () => {
  return {
    __esModule: true, // This property is needed for Babel to understand the default export
    default: class {
      static getInstance() {
        return jest.fn().mockResolvedValue({ data: [1, 2, 3] });
      }
    },
  };
});

jest.mock('../src/app/api/products/pinecone', () => ({
  getPinecone: jest.fn().mockResolvedValue({}),
  getNamespace: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ matches: [] }),
  }),
}));

jest.mock('../src/app/logger', () => ({
  info: jest.fn(),
}));

jest.mock('../src/app/workerIdSingleton', () => 'test-worker-id');

describe('API Route - Your Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PINECONE_INDEX = 'test-index';
  });

  it('should handle a valid request', async () => {
    const req = {
      json: jest.fn().mockResolvedValue({ searchTerm: 'test', currentPage: 1 }),
    };

    const response = await handler(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(query).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
    expect(getPinecone).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(5);
  });

});

