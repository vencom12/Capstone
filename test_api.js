const mongoose = require('mongoose');
const adminController = require('./controllers/adminController');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Ryven';

mongoose.connect(uri)
    .then(async () => {
        console.log('--- TESTING getAnalytics ---');
        const req = {};
        const res = {
            json: (data) => {
                console.log('SUCCESS:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
                process.exit(0);
            },
            status: (code) => ({
                json: (data) => {
                    console.log('ERROR', code, ':', data);
                    process.exit(1);
                }
            })
        };
        await adminController.getAnalytics(req, res);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
