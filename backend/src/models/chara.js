const mongoose = require("mongoose");

const CharaPurchaseSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerKg: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  supplier: {
    type: String,
    required: false,
    trim: true
  },
  notes: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      ret.id = ret._id.toString();
      return ret;
    }
  }
});

const DailyCharaConsumptionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  animalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Animal',
    required: false
  },
  notes: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      ret.id = ret._id.toString();
      return ret;
    }
  }
});

const CharaPurchase = mongoose.model('CharaPurchase', CharaPurchaseSchema);
const DailyCharaConsumption = mongoose.model('DailyCharaConsumption', DailyCharaConsumptionSchema);

// Helper functions for backward compatibility
async function listCharaPurchases() {
  return await CharaPurchase.find({}).sort({ date: -1 });
}

async function createCharaPurchase(purchaseData) {
  const purchase = new CharaPurchase(purchaseData);
  return await purchase.save();
}

async function listCharaConsumptions() {
  return await DailyCharaConsumption.find({}).sort({ date: -1 });
}

async function createCharaConsumption(consumptionData) {
  const consumption = new DailyCharaConsumption(consumptionData);
  return await consumption.save();
}

// For backward compatibility with existing code
const charaPurchases = [];
const charaConsumptions = [];

module.exports = {
  CharaPurchase,
  DailyCharaConsumption,
  charaPurchases,
  charaConsumptions,
  listCharaPurchases,
  createCharaPurchase,
  listCharaConsumptions,
  createCharaConsumption,
};
