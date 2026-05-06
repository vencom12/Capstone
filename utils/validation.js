const Joi = require('joi');

const schemas = {
    topup: Joi.object({
        amount: Joi.number().positive().required().messages({
            'number.base': 'Amount must be a number',
            'number.positive': 'Amount must be greater than zero',
            'any.required': 'Amount is required'
        })
    }),
    order: Joi.object({
        items: Joi.array().items(Joi.object({
            name: Joi.string().required(),
            price: Joi.number().required(),
            quantity: Joi.number().integer().min(1).required()
        })).min(1).required(),
        totalAmount: Joi.number().required(),
        paymentMethod: Joi.string().valid('wallet', 'cash_at_counter', 'stripe_stub', 'paypal_stub', 'none').required(),
        address: Joi.string().allow(''),
        deliveryTime: Joi.string().allow(''),
        notes: Joi.string().allow('')
    }),
    statusUpdate: Joi.object({
        ids: Joi.array().items(Joi.string()).min(1).required(),
        status: Joi.string().required()
    })
};

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        const message = error.details.map(d => d.message).join(', ');
        return res.status(400).json({ message });
    }
    next();
};

const validateEvent = (schema, data) => {
    const { error } = schema.validate(data);
    if (error) {
        console.error('[Validation] Malformed socket event data:', error.details[0].message);
        return false;
    }
    return true;
};

module.exports = {
    schemas,
    validate,
    validateEvent
};
