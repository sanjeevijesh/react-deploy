const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Meal = require('../models/Meal.js');
const mongoose = require('mongoose'); // Ensure Mongoose is imported

// @route   GET api/meals
// @desc    Get all meals for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Explicitly convert the user ID string to a MongoDB ObjectId
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const meals = await Meal.find({ user: userId }).sort({ date: -1 });
    res.json(meals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/meals
// @desc    Log a new meal
// @access  Private
router.post('/', auth, async (req, res) => {
  const { name, calories } = req.body;
  try {
    const newMeal = new Meal({
      name,
      calories,
      user: req.user.id,
    });
    const meal = await newMeal.save();
    res.json(meal);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- DELETE and UPDATE routes ---
router.delete('/:id', auth, async (req, res) => {
  try {
    let meal = await Meal.findById(req.params.id);
    if (!meal) return res.status(404).json({ msg: 'Meal not found' });
    if (meal.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    await Meal.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Meal removed' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.put('/:id', auth, async (req, res) => {
  const { name, calories } = req.body;
  try {
    let meal = await Meal.findById(req.params.id);
    if (!meal) return res.status(404).json({ msg: 'Meal not found' });
    if (meal.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    meal = await Meal.findByIdAndUpdate(
      req.params.id,
      { $set: { name, calories } },
      { new: true }
    );
    res.json(meal);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;