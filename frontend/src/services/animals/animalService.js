/**
 * Animal Service
 * Handle animal sales and purchase operations
 */

import { apiClient } from '../api/apiClient';

export const animalService = {
  getAnimals: async () => {
    const response = await apiClient.get('/animals');
    return response.map((animal) => ({
      ...animal,
      id: animal._id || animal.id,
    }));
  },

  addAnimal: async (animal) => {
    const response = await apiClient.post('/animals', animal);
    return {
      ...response,
      id: response._id || response.id,
    };
  },

  recordSale: async (transaction) => {
    const response = await apiClient.post('/animals/sale', {
      date: transaction.date.toISOString(),
      price: transaction.price,
      buyer: transaction.buyer,
      buyerPhone: transaction.buyerPhone,
      notes: transaction.notes,
      animalId: transaction.animalId,
      animalName: transaction.animalName,
      animalType: transaction.animalType,
      breed: transaction.breed,
      gender: transaction.gender,
      location: transaction.location,
      temperament: transaction.temperament,
      description: transaction.description,
    });
    
    // Convert date string back to Date object
    return {
      ...response,
      _id: response._id,
      id: response._id || response.id,
      date: new Date(response.date),
    };
  },

  recordPurchase: async (transaction) => {
    const response = await apiClient.post('/animals/purchase', {
      date: transaction.date.toISOString(),
      price: transaction.price,
      seller: transaction.seller,
      sellerPhone: transaction.sellerPhone,
      notes: transaction.notes,
      animalId: transaction.animalId,
      animalName: transaction.animalName,
      animalType: transaction.animalType,
      breed: transaction.breed,
      gender: transaction.gender,
      location: transaction.location,
      temperament: transaction.temperament,
      description: transaction.description,
    });
    
    // Convert date string back to Date object
    return {
      ...response,
      _id: response._id,
      id: response._id || response.id,
      date: new Date(response.date),
    };
  },

  getTransactions: async () => {
    const response = await apiClient.get('/animals/transactions');
    
    // Convert date strings back to Date objects
    return response.map((tx) => ({
      ...tx,
      _id: tx._id,
      id: tx._id || tx.id,
      date: new Date(tx.date),
    }));
  },
};

