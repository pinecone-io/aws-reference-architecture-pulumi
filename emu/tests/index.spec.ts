import { hi } from "@src";

describe("Index", () => {
  const consoleMock = vi.spyOn(console, "log").mockImplementation(() => {});

  afterAll(() => {
    consoleMock.mockReset();
  });

  it("Just a simple test", () => {
    hi();
    expect(consoleMock).toHaveBeenCalledWith("Hello Pinecone");
  });
});
