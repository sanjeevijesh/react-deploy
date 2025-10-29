const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.js');
const Record = require('../models/Record.js');
const Meal = require('../models/Meal.js');
const Workout = require('../models/Workout.js');
const mongoose = require('mongoose');

// --- THIS HELPER FUNCTION IS FIXED ---
// It now uses the '$set' operator for a safer database update
// and avoids the object spread that was causing the error.
const updateRecord = async (userId, recordType, newValue, unit, source) => {
    try {
        if (isNaN(newValue) || newValue <= 0) return;

        const existingRecord = await Record.findOne({ user: userId, recordType });

        if (!existingRecord || newValue > existingRecord.value) {
            const updateData = {
                value: newValue,
                unit,
                dateAchieved: new Date(),
            };

            // Safely add source fields if they exist
            if (source && source.sourceMeal) {
                updateData.sourceMeal = source.sourceMeal;
            }
            if (source && source.sourceWorkout) {
                updateData.sourceWorkout = source.sourceWorkout;
            }

            await Record.findOneAndUpdate(
                { user: userId, recordType },
                { $set: updateData }, // Use the $set operator for safety
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
    } catch (error) {
        console.error(`Error updating record for ${recordType}:`, error);
    }
};
// --- END OF FIX ---

// @route   POST api/records/update
router.post('/update', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // --- WORKOUT-BASED RECORDS ---
        const allWorkouts = await Workout.find({ user: userId }).sort({ date: 'desc' });
        const latestWorkout = allWorkouts[0];

        if (latestWorkout) {
            // 1. Longest Workout
            const durationParts = latestWorkout.duration.split(' ');
            let durationValue = parseInt(durationParts[0]);
            if (!isNaN(durationValue)) {
                if (durationParts[1]?.toLowerCase().includes('hour')) {
                    durationValue *= 60; // convert hours to minutes
                }
                await updateRecord(userId, 'longest_workout', durationValue, 'min', { sourceWorkout: latestWorkout._id });
            }

            // 2. Most Reps (Bench Press) - example specific record
            if (latestWorkout.name.toLowerCase().includes('bench press')) {
                const reps = parseInt(latestWorkout.duration.split(' ')[0]);
                if (!isNaN(reps)) {
                    await updateRecord(userId, 'most_reps_bench_press', reps, 'reps', { sourceWorkout: latestWorkout._id });
                }
            }
        }
        
        // --- MEAL-BASED RECORDS ---
        const latestMeal = await Meal.findOne({ user: userId }).sort({ date: -1 });
        if (latestMeal) {
            // 3. Highest Calorie Meal
            await updateRecord(userId, 'highest_calorie_meal', latestMeal.calories, 'kcal', { sourceMeal: latestMeal._id });
        }

        // --- DAILY AGGREGATE RECORDS ---
        const today = new Date();
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));

        // 4. Most Calories Burned in a Day & Most Workouts in a Day
        const todaysWorkouts = await Workout.find({ user: userId, date: { $gte: startOfDay, $lte: endOfDay } });
        if (todaysWorkouts.length > 0) {
            const totalCaloriesBurnedToday = todaysWorkouts.reduce((sum, w) => sum + (w.caloriesBurned || 0), 0);
            await updateRecord(userId, 'most_calories_burned_day', totalCaloriesBurnedToday, 'kcal', {});
            await updateRecord(userId, 'most_workouts_in_a_day', todaysWorkouts.length, 'workouts', {});
        }
        
        // 5. Highest Calorie Day
        const todaysMeals = await Meal.find({ user: userId, date: { $gte: startOfDay, $lte: endOfDay } });
        if (todaysMeals.length > 0) {
            const totalCaloriesConsumedToday = todaysMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
            await updateRecord(userId, 'highest_calorie_day', totalCaloriesConsumedToday, 'kcal', {});
        }

        // --- STREAK RECORD ---
        // 6. Longest Workout Streak
        if (allWorkouts.length > 0) {
            const workoutDates = [...new Set(allWorkouts.map(w => w.date.toISOString().split('T')[0]))].sort().reverse();
            let longestStreak = 0;
            let currentStreak = 0;
            if (workoutDates.length > 0) {
                currentStreak = 1;
                longestStreak = 1;
                for (let i = 0; i < workoutDates.length - 1; i++) {
                    const currentDate = new Date(workoutDates[i]);
                    const nextDate = new Date(workoutDates[i + 1]);
                    const diffTime = currentDate - nextDate;
                    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
                    if (diffDays === 1) {
                        currentStreak++;
                    } else if (diffDays > 1) {
                        longestStreak = Math.max(longestStreak, currentStreak);
                        currentStreak = 1; // Reset for the next potential streak
                    }
                }
                longestStreak = Math.max(longestStreak, currentStreak);
            }
             await updateRecord(userId, 'longest_workout_streak', longestStreak, 'days', {});
        }

        res.status(200).json({ msg: 'Records checked and updated.' });
    } catch (error) {
        console.error("Record update error:", error)
        res.status(500).send('Server Error');
    }
});


// @route   GET api/records
router.get('/', auth, async (req, res) => {
    try {
        const records = await Record.find({ user: req.user.id })
            .populate('sourceMeal', 'name')
            .populate('sourceWorkout', 'name');
        res.json(records);
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;