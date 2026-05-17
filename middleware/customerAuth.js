const jwt = require('jsonwebtoken');

const customerAuth = () => {
    return (req, res, next) => {
        const token = req.cookies.admin_token || req.cookies.employee_token || req.cookies.customer_token || req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'customer' && decoded.role !== 'admin' && decoded.role !== 'employee') {
                return res.status(403).json({ message: 'Access denied' });
            }
            req.user = decoded;
            next();
        } catch (err) {
            res.status(401).json({ message: 'Token is not valid' });
        }
    };
};

module.exports = customerAuth;
