const { z } = require("zod");
const { 
  getAllAnimals, 
  getAnimalById, 
  addAnimal, 
  updateAnimalStatus,
  addAnimalTransaction,
  getAllAnimalTransactions
} = require("../models");

const animalSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  breed: z.string().optional(),
  age: z.number().int().nonnegative().optional(),
  purchaseDate: z.string().datetime().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  status: z.union([z.literal("active"), z.literal("sold"), z.literal("deceased")]).default("active")
});

const transactionSchema = z.object({
  date: z.string().datetime(),
  price: z.number().nonnegative(),
  buyer: z.string().optional(),
  buyerPhone: z.string().optional(),
  seller: z.string().optional(),
  sellerPhone: z.string().optional(),
  notes: z.string().optional(),
  animalId: z.string().optional(), // Optional for standalone transactions (animal name/ID)
  animalName: z.string().optional(),
  animalType: z.string().optional(),
  breed: z.string().optional(),
  gender: z.string().optional(),
  location: z.string().optional(),
  temperament: z.string().optional(),
  description: z.string().optional(),
});

const listAnimals = async (_req, res) => {
  try {
    const animals = await getAllAnimals();
    return res.json(animals);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch animals" });
  }
};

const createAnimal = async (req, res) => {
  const parsed = animalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const newAnimal = await addAnimal(parsed.data);
    return res.status(201).json(newAnimal);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create animal" });
  }
};

const purchaseAnimal = async (req, res) => {
  const { id } = req.params;
  
  try {
    const animal = await getAnimalById(id);
    if (!animal) return res.status(404).json({ error: "Animal not found" });
    
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    
    // Create transaction
    const tx = await addAnimalTransaction({
      animalId: id,
      type: "purchase",
      ...parsed.data
    });
    
    // Update animal status to active
    await updateAnimalStatus(id, "active");
    
    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to record animal purchase" });
  }
};

const sellAnimal = async (req, res) => {
  const { id } = req.params;
  
  try {
    const animal = await getAnimalById(id);
    if (!animal) return res.status(404).json({ error: "Animal not found" });
    
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    
    // Create sale transaction
    const tx = await addAnimalTransaction({
      animalId: id,
      type: "sale",
      ...parsed.data
    });
    
    // Update animal status to sold
    await updateAnimalStatus(id, "sold");
    
    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to record animal sale" });
  }
};

const listAnimalTransactions = async (_req, res) => {
  try {
    const transactions = await getAllAnimalTransactions();
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch animal transactions" });
  }
};

// Standalone transaction endpoints (like milk transactions)
const createAnimalSale = async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const tx = await addAnimalTransaction({ type: "sale", ...parsed.data });
    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create animal sale" });
  }
};

const createAnimalPurchase = async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const tx = await addAnimalTransaction({ type: "purchase", ...parsed.data });
    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create animal purchase" });
  }
};

module.exports = {
  listAnimals,
  createAnimal,
  purchaseAnimal,
  sellAnimal,
  listAnimalTransactions,
  createAnimalSale,
  createAnimalPurchase,
};

