const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const { 
  createAnimal, 
  listAnimals, 
  purchaseAnimal, 
  sellAnimal,
  listAnimalTransactions,
  createAnimalSale,
  createAnimalPurchase
} = require("../controllers/animals.controller");

const router = Router();

// Animal routes
router.get("/", requireAuth, listAnimals);
router.post("/", requireAuth, createAnimal);

// Animal transaction routes (linked to specific animal)
router.post("/:id/purchase", requireAuth, purchaseAnimal);
router.post("/:id/sale", requireAuth, sellAnimal);
router.get("/transactions", requireAuth, listAnimalTransactions);

// Standalone transaction routes (like milk transactions)
router.post("/sale", requireAuth, createAnimalSale);
router.post("/purchase", requireAuth, createAnimalPurchase);

module.exports = { router };

