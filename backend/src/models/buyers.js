const mongoose = require("mongoose");

const BuyerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
    // Note: unique: true automatically creates an index
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: false,
    min: 0
  },
  rate: {
    type: Number,
    required: false,
    min: 0
  },
  active: {
    type: Boolean,
    default: true,
    required: false
  },
  milkSource: {
    type: String,
    enum: ['cow', 'buffalo', 'sheep', 'goat'],
    default: 'cow',
    required: false,
    trim: true,
    lowercase: true
  },
  // Delivery schedule: show in Quick Sale only on these days (0=Sun, 1=Mon, ..., 6=Sat). Empty = daily.
  deliveryDays: {
    type: [Number],
    required: false,
    default: undefined
  },
  // Alternate days: 1=daily, 2=every 2nd day, 3=every 3rd day. Used when deliveryDays not set.
  deliveryCycleDays: {
    type: Number,
    required: false,
    min: 1,
    default: undefined
  },
  // Reference date (start of day) for cycle. Required when deliveryCycleDays > 1.
  deliveryCycleStartDate: {
    type: Date,
    required: false,
    default: undefined
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      ret.userId = ret.userId.toString();
      return ret;
    }
  }
});

// Indexes
// Note: userId already has unique: true which creates an index automatically

const Buyer = mongoose.model('Buyer', BuyerSchema);

async function findBuyerByUserId(userId) {
  const buyer = await Buyer.findOne({ userId: userId });
  return buyer;
}

async function addBuyer(buyerData) {
  const buyer = new Buyer(buyerData);
  const saved = await buyer.save();
  console.log('[buyers] Buyer record created successfully:', {
    _id: saved._id,
    userId: saved.userId,
    name: saved.name,
    quantity: saved.quantity,
    rate: saved.rate,
  });
  return saved;
}

async function getAllBuyers(filter = {}) {
  const query = { ...filter };
  const buyers = await Buyer.find(query);
  return buyers;
}

async function getBuyerById(id) {
  return await Buyer.findById(id);
}

async function updateBuyerById(id, updates) {
  return await Buyer.findByIdAndUpdate(id, { $set: updates }, { new: true });
}

async function updateBuyer(userId, updates) {
  const buyer = await Buyer.findOneAndUpdate(
    { userId: userId },
    { $set: updates },
    { new: true }
  );
  return buyer;
}

module.exports = {
  Buyer,
  findBuyerByUserId,
  addBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
  updateBuyerById,
};
