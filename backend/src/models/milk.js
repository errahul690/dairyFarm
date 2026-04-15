const mongoose = require("mongoose");

const MilkTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["sale", "purchase"],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerLiter: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  buyer: {
    type: String,
    required: false,
    trim: true
  },
  buyerPhone: {
    type: String,
    required: false,
    trim: true
  },
  /** Reference to User (buyer). Prefer this over buyerPhone when linking; name/mobile can change. */
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  seller: {
    type: String,
    required: false,
    trim: true
  },
  sellerPhone: {
    type: String,
    required: false,
    trim: true
  },
  /** Reference to User (seller). Prefer this over sellerPhone when linking; name/mobile can change. */
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  notes: {
    type: String,
    required: false,
    trim: true
  },
  // Milk source: Cow, Buffalo, Sheep, Goat
  milkSource: {
    type: String,
    enum: ['cow', 'buffalo', 'sheep', 'goat'],
    required: false,
    default: 'cow',
    trim: true,
    lowercase: true
  },
  fixedPrice: {
    type: Number,
    required: false,
    min: 0
  },
  paymentType: {
    type: String,
    enum: ["cash", "credit"],
    required: false,
    default: "cash",
    trim: true
  },
  amountReceived: {
    type: Number,
    required: false,
    min: 0
  },
  // Payment tracking fields
  paymentStatus: {
    type: String,
    enum: ["unpaid", "partial", "paid"],
    default: "unpaid",
    required: false
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0,
    required: false
  },
  paymentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  }],
  // Track which payment covered which quantity
  paidQuantity: {
    type: Number,
    default: 0,
    min: 0,
    required: false
  },
  requestSource: {
    type: String,
    enum: ['admin', 'buyer_app'],
    default: 'admin',
    required: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      if (ret.buyerId) ret.buyerId = ret.buyerId.toString();
      if (ret.sellerId) ret.sellerId = ret.sellerId.toString();
      if (ret.paymentIds) {
        ret.paymentIds = ret.paymentIds.map(id => id.toString());
      }
      // Purane records: agar cash sale mein amountReceived hai lekin paidAmount 0 hai, to response mein sahi dikhao
      if (ret.type === 'sale' && ret.paymentType === 'cash' && ret.amountReceived != null && (ret.paidAmount == null || ret.paidAmount === 0)) {
        ret.paidAmount = ret.amountReceived;
        ret.paymentStatus = ret.amountReceived >= (ret.totalAmount || 0) ? 'paid' : (ret.amountReceived > 0 ? 'partial' : 'unpaid');
      }
      return ret;
    }
  }
});

// Indexes for filtering
MilkTransactionSchema.index({ buyerPhone: 1 });
MilkTransactionSchema.index({ sellerPhone: 1 });
MilkTransactionSchema.index({ buyerId: 1 });
MilkTransactionSchema.index({ sellerId: 1 });
MilkTransactionSchema.index({ date: -1 });
MilkTransactionSchema.index({ milkSource: 1 });
MilkTransactionSchema.index({ paymentStatus: 1 });
MilkTransactionSchema.index({ requestSource: 1 });

const MilkTransaction = mongoose.model('MilkTransaction', MilkTransactionSchema);

async function getAllMilkTransactions(mobileNumber, requestSource = null, userId = null, options = {}) {
  let query = {};
  if (mobileNumber || userId) {
    const orConditions = [];
    if (userId) {
      orConditions.push({ buyerId: userId }, { sellerId: userId });
    }
    if (mobileNumber) {
      orConditions.push({ buyerPhone: mobileNumber }, { sellerPhone: mobileNumber });
    }
    query.$or = orConditions;
  }
  if (requestSource) query.requestSource = requestSource;

  if (options.type && ["sale", "purchase"].includes(options.type)) {
    query.type = options.type;
  }
  if (options.from || options.to) {
    const dateQuery = {};
    if (options.from instanceof Date && !isNaN(options.from.getTime())) dateQuery.$gte = options.from;
    if (options.to instanceof Date && !isNaN(options.to.getTime())) dateQuery.$lt = options.to;
    if (Object.keys(dateQuery).length > 0) query.date = dateQuery;
  }

  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(2000, options.limit)) : null;
  const skip = Number.isFinite(options.skip) ? Math.max(0, options.skip) : 0;

  let q = MilkTransaction.find(query).sort({ date: -1 });
  if (skip) q = q.skip(skip);
  if (limit) q = q.limit(limit);
  const transactions = await q;
  return transactions;
}

async function getMilkRequests() {
  return await MilkTransaction.find({ type: 'sale', requestSource: 'buyer_app' }).sort({ date: -1, createdAt: -1 });
}

async function addMilkTransaction(transactionData) {
  const data = { ...transactionData };
  // When milk sale is cash and amountReceived is given, set paidAmount and paymentStatus
  if (data.type === 'sale' && data.paymentType === 'cash' && data.amountReceived != null && data.amountReceived >= 0) {
    data.paidAmount = Number(data.amountReceived);
    if (data.paidAmount >= (data.totalAmount || 0)) {
      data.paymentStatus = 'paid';
    } else if (data.paidAmount > 0) {
      data.paymentStatus = 'partial';
    } else {
      data.paymentStatus = 'unpaid';
    }
  }
  const transaction = new MilkTransaction(data);
  return await transaction.save();
}

async function getMilkTransactionById(transactionId) {
  return await MilkTransaction.findById(transactionId);
}

async function updateMilkTransaction(transactionId, updates) {
  return await MilkTransaction.findByIdAndUpdate(
    transactionId,
    { $set: updates },
    { new: true, runValidators: true }
  );
}

async function deleteMilkTransaction(transactionId) {
  return await MilkTransaction.findByIdAndDelete(transactionId);
}

// Get unpaid milk transactions for a customer (type: sale, buyer)
async function getUnpaidMilkTransactions(customerMobile, customerId = null) {
  const buyerMatch = [];
  if (customerMobile) buyerMatch.push({ buyerPhone: customerMobile.trim() });
  if (customerId) buyerMatch.push({ buyerId: customerId });
  if (buyerMatch.length === 0) return [];
  const query = {
    type: 'sale',
    $and: [
      { $or: [{ paymentStatus: 'unpaid' }, { paymentStatus: 'partial' }] },
      { $or: buyerMatch }
    ]
  };
  return await MilkTransaction.find(query).sort({ date: -1 }).limit(100);
}

// Get unpaid milk transactions for a seller (type: purchase – we owe the seller)
async function getUnpaidMilkTransactionsForSeller(sellerMobile) {
  if (!sellerMobile || !String(sellerMobile).trim()) return [];
  const query = {
    type: 'purchase',
    sellerPhone: String(sellerMobile).trim(),
    $or: [
      { paymentStatus: 'unpaid' },
      { paymentStatus: 'partial' }
    ]
  };
  return await MilkTransaction.find(query).sort({ date: -1 }).limit(100);
}

// Update milk transaction payment status
async function updateMilkTransactionPayment(transactionId, paymentId, paidAmount, paidQuantity) {
  const transaction = await MilkTransaction.findById(transactionId);
  if (!transaction) {
    throw new Error('Milk transaction not found');
  }
  
  // Update paid amounts
  transaction.paidAmount = (transaction.paidAmount || 0) + paidAmount;
  transaction.paidQuantity = (transaction.paidQuantity || 0) + paidQuantity;
  
  // Add payment ID if not already present
  if (!transaction.paymentIds) {
    transaction.paymentIds = [];
  }
  if (!transaction.paymentIds.includes(paymentId)) {
    transaction.paymentIds.push(paymentId);
  }
  
  // Update payment status
  if (transaction.paidAmount >= transaction.totalAmount && transaction.paidQuantity >= transaction.quantity) {
    transaction.paymentStatus = 'paid';
  } else if (transaction.paidAmount > 0 || transaction.paidQuantity > 0) {
    transaction.paymentStatus = 'partial';
  } else {
    transaction.paymentStatus = 'unpaid';
  }
  
  return await transaction.save();
}

async function getMilkTransactionById(transactionId) {
  return await MilkTransaction.findById(transactionId);
}

async function updateMilkTransaction(transactionId, updates) {
  return await MilkTransaction.findByIdAndUpdate(
    transactionId,
    { $set: updates },
    { new: true, runValidators: true }
  );
}

async function deleteMilkTransaction(transactionId) {
  return await MilkTransaction.findByIdAndDelete(transactionId);
}

module.exports = {
  MilkTransaction,
  getAllMilkTransactions,
  getMilkRequests,
  addMilkTransaction,
  getMilkTransactionById,
  updateMilkTransaction,
  deleteMilkTransaction,
  getUnpaidMilkTransactions,
  getUnpaidMilkTransactionsForSeller,
  updateMilkTransactionPayment,
};
