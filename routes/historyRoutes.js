const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Meal = require('../models/Meal');
const Workout = require('../models/Workout');
const mongoose = require('mongoose');

// @route   GET api/history
// @desc    Get all meals and workouts for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const meals = await Meal.find({ user: userId });
    const workouts = await Workout.find({ user: userId });

    // Add a 'type' field to distinguish between meals and workouts
    const formattedMeals = meals.map(m => ({ ...m.toObject(), type: 'meal' }));
    const formattedWorkouts = workouts.map(w => ({ ...w.toObject(), type: 'workout' }));

    // Combine and sort all items by date, newest first
    const combinedHistory = [...formattedMeals, ...formattedWorkouts].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(combinedHistory);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
