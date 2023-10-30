const useUpdateDescription = () => {
    const updateDescription = async (sku: string, description: string) => {
        try {
            const response = await fetch('/api/updateDescription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sku, description }),
            });
            const data = await response.json();
            // Handle the response as needed
            return data
        } catch (error) {
            console.error('Error updating description:', error);
        }
    };

    return { updateDescription };
};

export default useUpdateDescription