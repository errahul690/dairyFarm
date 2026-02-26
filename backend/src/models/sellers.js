const mongoose = require("mongoose");

const SellerSchema = new mongoose.Schema({
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

const Seller = mongoose.model('Seller', SellerSchema);

async function findSellerByUserId(userId) {
  const seller = await Seller.findOne({ userId: userId });
  return seller;
}

async function addSeller(sellerData) {
  const seller = new Seller(sellerData);
  const saved = await seller.save();
  console.log('[sellers] Seller record created successfully:', {
    _id: saved._id,
    userId: saved.userId,
    name: saved.name,
    quantity: saved.quantity,
    rate: saved.rate,
  });
  return saved;
}

async function getSellerById(id) {
  return await Seller.findById(id);
}

async function getAllSellers() {
  const sellers = await Seller.find({});
  return sellers;
}

async function updateSeller(userId, updates) {
  const seller = await Seller.findOneAndUpdate(
    { userId: userId },
    { $set: updates },
    { new: true }
  );
  return seller;
}

module.exports = {
  Seller,
  findSellerByUserId,
  getSellerById,
  addSeller,
  getAllSellers,
  updateSeller,
};
