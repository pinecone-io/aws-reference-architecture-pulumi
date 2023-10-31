"use client"
import { useState, useEffect } from 'react';

type Product = {
  name: string;
  sku: string;
  description: string;
  price: number;
};

const useFetchProducts = (searchTerm: string, currentPage: number) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ searchTerm, currentPage }),
        });
        const data = await response.json();
        console.log("data", data)
        setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [searchTerm, currentPage]);

  const updateLocalDescription = (index: number, product: Product) => {
    const updatedProducts = [...products];
    console.log('product', product)
    updatedProducts[index].description = product.description;
    setProducts(updatedProducts);
  };

  return { products, loading, updateLocalDescription };
};

export default useFetchProducts