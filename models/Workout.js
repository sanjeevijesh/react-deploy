const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WorkoutSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  duration: {
    type: String, // e.g., "30 minutes"
    required: true,
  },
  // --- NEW FIELD ---
  caloriesBurned: {
    type: Number,
    required: false, // Optional for now to support older entries
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Workout', WorkoutSchema);

