require('dotenv').config();
const prisma = require('./utils/prisma');
const aiController = require('./controllers/postgres/aiController');

async function run() {
    const mockUser = await prisma.user.findFirst({ where: { role: 'employee' } });
    if (!mockUser) {
        console.error("No employee user found in DB to mock request.");
        return;
    }

    const req = {
        body: {
            message: "what are your insights?",
            history: []
        },
        user: {
            id: mockUser.id,
            role: mockUser.role
        },
        app: {
            get: () => null // mock socket io
        }
    };

    const res = {
        json: (data) => {
            console.log("RESPONSE JSON:", JSON.stringify(data, null, 2));
        },
        status: (code) => {
            console.log("STATUS CODE:", code);
            return res;
        }
    };

    console.log("Calling aiController.chat with user:", mockUser.username);
    await aiController.chat(req, res);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
