const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Meal = require('../models/Meal.js');
const Workout = require('../models/Workout.js');
const User = require('../models/User.js'); // Import User model
const mongoose = require('mongoose');

// Helper function to get the start date (no changes here)
const getStartDate = (days) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    return startDate;
};

// @route   GET api/analytics/calorie-history (no changes here)
router.get('/calorie-history', auth, async (req, res) => {
    try {
        const days = req.query.days || 7;
        const startDate = getStartDate(days);
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const calorieData = await Meal.aggregate([
            { $match: { user: userId, date: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } },
                    totalCalories: { $sum: '$calories' },
                },
            },
            { $sort: { _id: 1 } },
        ]);
        res.json(calorieData);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/analytics/summary (no changes here)
router.get('/summary', auth, async (req, res) => {
    try {
        const days = req.query.days || 7;
        const startDate = getStartDate(days);
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const meals = await Meal.find({ user: userId, date: { $gte: startDate } });
        const workouts = await Workout.find({ user: userId, date: { $gte: startDate } });
        const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
        const averageDailyCalories = meals.length > 0 ? totalCalories / days : 0;
        const totalWorkouts = workouts.length;
        const workoutDays = new Set(workouts.map(w => new Date(w.date).toISOString().split('T')[0]));
        const workoutConsistency = workoutDays.size;
        const workoutHistory = await Workout.aggregate([
            { $match: { user: userId, date: { $gte: startDate } } },
            { $project: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } }, durationMinutes: { $toInt: { $arrayElemAt: [{ $split: ["$duration", " "] }, 0] } } } },
            { $group: { _id: '$date', totalDuration: { $sum: '$durationMinutes' } } },
            { $sort: { _id: 1 } },
        ]);
        const allUserWorkouts = await Workout.find({ user: userId }).sort({ date: -1 });
        let currentStreak = 0;
        if (allUserWorkouts.length > 0) {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            const workoutDates = [...new Set(allUserWorkouts.map(w => new Date(w.date).toISOString().split('T')[0]))];
            if (workoutDates.includes(today.toISOString().split('T')[0]) || workoutDates.includes(yesterday.toISOString().split('T')[0])) {
                let lastWorkoutDate = new Date(workoutDates[0]);
                for (const dateStr of workoutDates) {
                    const currentDate = new Date(dateStr);
                    const diffDays = (lastWorkoutDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24);
                    if (diffDays <= 1) {
                        currentStreak++;
                    } else {
                        break;
                    }
                    lastWorkoutDate = currentDate;
                }
            }
        }
        const dailyBurn = await Workout.aggregate([
            { $match: { user: userId, caloriesBurned: { $exists: true, $ne: null } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } }, totalBurn: { $sum: '$caloriesBurned' } } },
            { $sort: { totalBurn: -1 } },
            { $limit: 1 }
        ]);
        const bestDay = dailyBurn.length > 0 ? { date: dailyBurn[0]._id, calories: dailyBurn[0].totalBurn } : null;
        res.json({
            averageDailyCalories: Math.round(averageDailyCalories),
            totalWorkouts,
            workoutConsistency,
            workoutHistory,
            currentStreak,
            bestDay
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// --- NEW ROUTE ADDED HERE ---
// @route   GET api/analytics/lifetime-stats
// @desc    Get all-time stats for the user
router.get('/lifetime-stats', auth, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        
        const totalWorkouts = await Workout.countDocuments({ user: userId });
        const totalMeals = await Meal.countDocuments({ user: userId });

        const caloriesBurnedResult = await Workout.aggregate([
            { $match: { user: userId, caloriesBurned: { $exists: true } } },
            { $group: { _id: null, total: { $sum: '$caloriesBurned' } } }
        ]);
        const totalCaloriesBurned = caloriesBurnedResult.length > 0 ? caloriesBurnedResult[0].total : 0;
        
        const user = await User.findById(req.user.id).select('createdAt');

        res.json({
            totalWorkouts,
            totalMeals,
            totalCaloriesBurned,
            memberSince: user.createdAt
        });
    } catch (err) {
        console.error("Lifetime stats error:", err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;