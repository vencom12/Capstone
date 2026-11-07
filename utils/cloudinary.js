const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'stitch-master-products',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
    }
});

// High-clarity storage for tall mobile payment receipt screenshots (preserves crisp OCR text)
const receiptStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'stitch-master-products',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 1600, height: 2400, crop: 'limit', quality: 'auto:good' }]
    }
});

module.exports = { cloudinary, storage, receiptStorage };
