const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RecordSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    recordType: {
        type: String,
        required: true,
        // e.g., 'heaviest_bench_press', 'longest_workout'
    },
    value: {
        type: Number,
        required: true,
    },
    unit: {
        type: String,
        // e.g., 'kg', 'minutes', 'kcal'
    },
    dateAchieved: {
        type: Date,
        default: Date.now,
    },
    sourceMeal: { type: Schema.Types.ObjectId, ref: 'Meal' },
    sourceWorkout: { type: Schema.Types.ObjectId, ref: 'Workout' },
});

// Ensure a user can only have one of each record type
RecordSchema.index({ user: 1, recordType: 1 }, { unique: true });

module.exports = mongoose.model('Record', RecordSchema);