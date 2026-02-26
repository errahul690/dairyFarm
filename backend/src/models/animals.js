const mongoose = require("mongoose");

const AnimalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  breed: {
    type: String,
    required: false,
    trim: true
  },
  age: {
    type: Number,
    required: false,
    min: 0
  },
  purchaseDate: {
    type: Date,
    required: false
  },
  purchasePrice: {
    type: Number,
    required: false,
    min: 0
  },
  status: {
    type: String,
    enum: ["active", "sold", "deceased"],
    default: "active"
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      return ret;
    }
  }
});

const AnimalTransactionSchema = new mongoose.Schema({
  animalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Animal',
    required: false
  },
  animalName: {
    type: String,
    required: false,
    trim: true
  },
  animalType: {
    type: String,
    required: false,
    trim: true
  },
  breed: {
    type: String,
    required: false,
    trim: true
  },
  gender: {
    type: String,
    required: false,
    trim: true
  },
  type: {
    type: String,
    enum: ["sale", "purchase"],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  price: {
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
  notes: {
    type: String,
    required: false,
    trim: true
  },
  location: {
    type: String,
    required: false,
    trim: true
  },
  temperament: {
    type: String,
    required: false,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret._id = ret._id.toString();
      if (ret.animalId) {
        ret.animalId = ret.animalId.toString();
      }
      return ret;
    }
  }
});

const Animal = mongoose.model('Animal', AnimalSchema);
const AnimalTransaction = mongoose.model('AnimalTransaction', AnimalTransactionSchema);

// Animal functions
async function getAllAnimals() {
  const animals = await Animal.find({});
  return animals;
}

async function getAnimalById(id) {
  const animal = await Animal.findById(id);
  return animal;
}

async function addAnimal(animalData) {
  const animal = new Animal(animalData);
  return await animal.save();
}

async function updateAnimalStatus(id, status) {
  await Animal.findByIdAndUpdate(id, { status: status });
}

// Animal Transaction functions
async function getAllAnimalTransactions() {
  const transactions = await AnimalTransaction.find({});
  return transactions;
}

async function addAnimalTransaction(transactionData) {
  const transaction = new AnimalTransaction(transactionData);
  return await transaction.save();
}

module.exports = {
  Animal,
  AnimalTransaction,
  getAllAnimals,
  getAnimalById,
  addAnimal,
  updateAnimalStatus,
  getAllAnimalTransactions,
  addAnimalTransaction,
};
