const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Workout = require('../models/Workout.js');
const mongoose = require('mongoose'); // Ensure Mongoose is imported

// @route   GET api/workouts
// @desc    Get all workouts for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // This is the fix from before: converting the ID to an ObjectId
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const workouts = await Workout.find({ user: userId }).sort({ date: -1 });
    res.json(workouts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/workouts
// @desc    Log a new workout
// @access  Private
router.post('/', auth, async (req, res) => {
  const { name, duration } = req.body;
  try {
    const newWorkout = new Workout({
      name,
      duration,
      user: req.user.id,
    });
    const workout = await newWorkout.save();
    res.json(workout);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- DELETE and UPDATE routes ---
router.delete('/:id', auth, async (req, res) => {
  try {
    let workout = await Workout.findById(req.params.id);
    if (!workout) {
      return res.status(404).json({ msg: 'Workout not found' });
    }
    if (workout.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    await Workout.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Workout removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.put('/:id', auth, async (req, res) => {
  const { name, duration } = req.body;
  try {
    let workout = await Workout.findById(req.params.id);
    if (!workout) {
      return res.status(404).json({ msg: 'Workout not found' });
    }
    if (workout.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    workout = await Workout.findByIdAndUpdate(
      req.params.id,
      { $set: { name, duration } },
      { new: true }
    );
    res.json(workout);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;