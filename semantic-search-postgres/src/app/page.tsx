"use client"
import { useState, useEffect } from 'react';
import DebouncedInput from './components/debouncedInput';
import useFetchProducts from './hooks/useFetchProducts';
import useUpdateDescription from './hooks/useUpdateDescription';  // New Hook

type Product = {
  name: string;
  sku: string;
  description: string;
  price: number;
};

const App = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [editableRow, setEditableRow] = useState<number | null>(null);
  const [newDescription, setNewDescription] = useState<string>('');


  const { products, loading, updateLocalDescription } = useFetchProducts(searchTerm, currentPage);
  const { updateDescription } = useUpdateDescription();  // New Hook

  const handleEditClick = (index: number, description: string) => {
    setEditableRow(index);
    setNewDescription(description);  // Set the value of the input box to the current description
  };

  const handleSaveClick = async (index: number, sku: string) => {
    const updatedProduct: Product = await updateDescription(sku, newDescription);
    if (updatedProduct) {
      updateLocalDescription(index, updatedProduct);
    }
    setEditableRow(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black-100">
      <div className="w-full max-w-3xl p-4">
        <DebouncedInput
          value={searchTerm}
          onChange={(value) => setSearchTerm(value)}
        />

        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border p-2">Name</th>
              <th className="border p-2">SKU</th>
              <th className="border p-2">Description</th>
              <th className="border p-2">Price</th>
            </tr>
          </thead>
          <tbody>
            {products?.map((product, index) => (
              <tr key={index}>
                <td className="border p-2">{product.name}</td>
                <td className="border p-2">{product.sku}</td>
                <td className="border p-2 relative">
                  {editableRow === index ? (
                    <>
                      <textarea
                        className="w-full p-2 mb-4 border rounded text-black"
                        rows={4}
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                      <div className="mt-2">
                        <button onClick={() => handleSaveClick(index, product.sku)}>✅</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {product.description}
                      <div className="absolute top-0 right-0 mt-2 mr-2 text-xs">
                        <button onClick={() => handleEditClick(index, product.description)}>✏️</button>
                      </div>
                    </>
                  )}

                </td>
                <td className="border p-2">{product.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between mt-4">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          >
            Previous
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
