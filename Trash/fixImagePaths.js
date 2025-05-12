// Add to Cart functionality
    async function addToCart(productId) {
        try {
            const response = await fetch('/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId }),
            });
            const data = await response.json();
            if (response.ok) {
                Swal.fire({
                    title: 'Success!',
                    text: data.message,
                    icon: 'success',
                    confirmButtonText: 'Go to Cart',
                    showCancelButton: true,
                    cancelButtonText: 'Continue Shopping',
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.location.href = '/cart';
                    }
                });
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: data.message,
                    icon: 'error',
                    confirmButtonText: 'OK',
                });
            }
        } catch (error) {
            Swal.fire({
                title: 'Error!',
                text: 'Error adding to cart. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
            });
        }
    }