const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerMobile: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentType: {
    type: String,
    enum: ["cash", "bank_transfer", "upi", "other"],
    required: true,
    default: "cash"
  },
  notes: {
    type: String,
    required: false,
    trim: true
  },
  referenceNumber: {
    type: String,
    required: false,
    trim: true
  },
  milkTransactionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MilkTransaction'
  }],
  milkQuantity: {
    type: Number,
    default: 0,
    min: 0,
    required: false
  },
  isSettlement: {
    type: Boolean,
    default: false,
    required: false
  },
  paymentDirection: {
    type: String,
    enum: ["from_buyer", "to_seller"],
    default: "from_buyer",
    required: false
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      ret.customerId = ret.customerId.toString();
      if (ret.milkTransactionIds) {
        ret.milkTransactionIds = ret.milkTransactionIds.map(id => id.toString());
      }
      return ret;
    }
  }
});

// Indexes for efficient queries
PaymentSchema.index({ customerId: 1 });
PaymentSchema.index({ customerMobile: 1 });
PaymentSchema.index({ paymentDate: -1 });
PaymentSchema.index({ paymentDirection: 1 });

const Payment = mongoose.model('Payment', PaymentSchema);

async function createPayment(paymentData) {
  const payment = new Payment(paymentData);
  return await payment.save();
}

async function getAllPayments(customerId = null, customerMobile = null, paymentDirection = null) {
  const query = { isSettlement: { $ne: true } };
  if (customerId) query.customerId = customerId;
  if (customerMobile) query.customerMobile = customerMobile.trim();
  if (paymentDirection != null && String(paymentDirection).trim() !== "") {
    const dir = paymentDirection.trim();
    if (dir === "to_seller") {
      query.paymentDirection = "to_seller";
    } else {
      query.$or = [{ paymentDirection: "from_buyer" }, { paymentDirection: { $exists: false } }];
    }
  }
  return await Payment.find(query).sort({ paymentDate: -1 });
}

async function getPaymentById(paymentId) {
  return await Payment.findById(paymentId);
}

async function updatePayment(paymentId, updates) {
  return await Payment.findByIdAndUpdate(
    paymentId,
    { $set: updates },
    { new: true }
  );
}

async function deletePayment(paymentId) {
  return await Payment.findByIdAndDelete(paymentId);
}

async function getTotalPaymentsByCustomer(customerId) {
  const result = await Payment.aggregate([
    { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
}

async function getSettlementPayments(filter = {}) {
  const query = { isSettlement: true };
  if (filter.customerMobile != null && String(filter.customerMobile).trim() !== "") {
    query.customerMobile = String(filter.customerMobile).trim();
  }
  if (filter.customerId != null && String(filter.customerId).trim() !== "") {
    query.customerId = filter.customerId;
  }
  if (filter.paymentDirection != null && String(filter.paymentDirection).trim() !== "") {
    const dir = filter.paymentDirection.trim();
    if (dir === "to_seller") query.paymentDirection = "to_seller";
    else query.$or = [{ paymentDirection: "from_buyer" }, { paymentDirection: { $exists: false } }];
  }
  return await Payment.find(query).sort({ paymentDate: -1 }).limit(500);
}

module.exports = {
  Payment,
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getTotalPaymentsByCustomer,
  getSettlementPayments,
};

