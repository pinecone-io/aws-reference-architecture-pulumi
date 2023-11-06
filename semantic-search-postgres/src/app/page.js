// Use client directive remains the same
"use client";
import { useState } from 'react';
import DebouncedInput from './components/debouncedInput';
import useFetchProducts from './hooks/useFetchProducts';
import useUpdateDescription from './hooks/useUpdateDescription';

const App = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editableRow, setEditableRow] = useState(null);
  const [newDescription, setNewDescription] = useState('');

  const { products, loading, updateLocalDescription } = useFetchProducts(searchTerm, currentPage);
  const { updateDescription } = useUpdateDescription();

  const handleEditClick = (index, description) => {
    setEditableRow(index);
    setNewDescription(description);
  };

  const handleSaveClick = async (index, sku) => {
    const updatedProduct = await updateDescription(sku, newDescription);
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

