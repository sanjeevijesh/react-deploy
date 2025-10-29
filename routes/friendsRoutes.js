const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.js');
const User = require('../models/User.js');
const Workout = require('../models/Workout.js');
const Meal = require('../models/Meal.js');
const fetch = require('node-fetch');

// ... (all previous routes like /search, /leaderboard, /feed, etc., remain here) ...

// @route   GET api/friends/search
router.get('/search', auth, async (req, res) => {
    try {
        const searchQuery = req.query.name || '';
        if (searchQuery.length < 2) {
            return res.json([]);
        }
        const users = await User.find({
            name: { $regex: searchQuery, $options: 'i' },
            _id: { $ne: req.user.id }
        }).select('name');
        res.json(users);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});
// @route   POST api/friends/send-request/:recipientId
router.post('/send-request/:recipientId', auth, async (req, res) => {
    try {
        const sender = await User.findById(req.user.id);
        const recipient = await User.findById(req.params.recipientId);
        if (!recipient || sender.id === recipient.id) {
            return res.status(400).json({ msg: 'Invalid request' });
        }
        if (!recipient.friendRequestsReceived) {
            recipient.friendRequestsReceived = [];
        }
        if (!sender.friendRequestsSent) {
            sender.friendRequestsSent = [];
        }
        if (recipient.friendRequestsReceived.includes(sender.id) || sender.friends.includes(recipient.id)) {
            return res.status(400).json({ msg: 'Friend request already sent or you are already friends.' });
        }
        recipient.friendRequestsReceived.push(sender.id);
        sender.friendRequestsSent.push(recipient.id);
        await recipient.save();
        await sender.save();
        res.json({ msg: 'Friend request sent.' });
    } catch (err) {
        console.error("Error sending friend request:", err);
        res.status(500).send('Server Error');
    }
});
// @route   POST api/friends/accept-request/:senderId
router.post('/accept-request/:senderId', auth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id);
        const sender = await User.findById(req.params.senderId);
        if (!currentUser.friends) currentUser.friends = [];
        if (!sender.friends) sender.friends = [];
        currentUser.friends.push(sender.id);
        sender.friends.push(currentUser.id);
        currentUser.friendRequestsReceived = currentUser.friendRequestsReceived.filter(id => id.toString() !== sender.id.toString());
        sender.friendRequestsSent = sender.friendRequestsSent.filter(id => id.toString() !== currentUser.id.toString());
        await currentUser.save();
        await sender.save();
        res.json({ msg: 'Friend request accepted.' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});
// @route   GET api/friends
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('friends', 'name')
            .populate('friendRequestsReceived', 'name');
        res.json({
            friends: user.friends || [],
            friendRequests: user.friendRequestsReceived || []
        });
    } catch (err) {
        console.error("Error fetching friends data:", err);
        res.status(500).send('Server Error');
    }
});
// @route   GET api/friends/leaderboard
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id).populate('friends');
        if (!currentUser) return res.status(404).json({ msg: 'User not found' });
        const userIds = [currentUser._id, ...currentUser.friends.map(f => f._id)];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const workoutScores = await Workout.aggregate([
            { $match: { user: { $in: userIds }, date: { $gte: sevenDaysAgo } } },
            { $addFields: { durationInMinutes: { $cond: { if: { $regexMatch: { input: "$duration", regex: /hour/i } }, then: { $multiply: [{ $toInt: { $arrayElemAt: [{ $split: ["$duration", " "] }, 0] } }, 60] }, else: { $cond: { if: { $regexMatch: { input: "$duration", regex: /minute/i } }, then: { $toInt: { $arrayElemAt: [{ $split: ["$duration", " "] }, 0] } }, else: 0 } } } } } },
            { $match: { durationInMinutes: { $gt: 0 } } },
            { $group: { _id: '$user', workoutScore: { $sum: { $multiply: ["$durationInMinutes", 10] } } } }
        ]);
        const allMeals = await Meal.find({ user: { $in: userIds }, date: { $gte: sevenDaysAgo } });
        const uniqueMealNames = [...new Set(allMeals.map(meal => meal.name))];
        let healthinessMap = {};
        if (uniqueMealNames.length > 0) {
            const prompt = `You are a nutrition expert. For the following JSON array of meal names, classify each as "Healthy" or "Unhealthy". Return your response as a single JSON object where keys are the meal names and values are the classification. For example: {"Grilled Chicken Salad": "Healthy", "Fried Parotta": "Unhealthy"}\n\n${JSON.stringify(uniqueMealNames)}`;
            const apiKey = process.env.GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            if (response.ok) {
                const result = await response.json();
                const jsonString = result.candidates[0].content.parts[0].text.replace(/```json\n?|\n?```/g, '');
                try {
                    healthinessMap = JSON.parse(jsonString);
                } catch (e) {
                    console.error("Failed to parse AI JSON response:", e);
                }
            }
        }
        const mealScores = {};
        allMeals.forEach(meal => {
            const userId = meal.user.toString();
            if (!mealScores[userId]) mealScores[userId] = 0;
            if (healthinessMap[meal.name] === 'Healthy') {
                mealScores[userId] += 50;
            }
        });
        const userScores = {};
        userIds.forEach(id => {
            const userName = id.equals(currentUser._id) ? currentUser.name : currentUser.friends.find(f => f._id.equals(id))?.name;
            if (userName) {
                 userScores[id.toString()] = { userId: id, name: userName, fitScore: 0 };
            }
        });
        workoutScores.forEach(item => {
            if (userScores[item._id.toString()]) {
                userScores[item._id.toString()].fitScore += item.workoutScore;
            }
        });
        Object.keys(mealScores).forEach(userId => {
             if (userScores[userId]) {
                userScores[userId].fitScore += mealScores[userId];
            }
        });
        const leaderboard = Object.values(userScores).sort((a, b) => b.fitScore - a.fitScore);
        res.json(leaderboard);
    } catch (err) {
        console.error("Leaderboard Error:", err);
        res.status(500).send('Server Error');
    }
});
// @route   GET api/friends/feed
router.get('/feed', auth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ msg: 'User not found' });
        const userIds = [currentUser._id, ...(currentUser.friends || [])];
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const mealsPromise = Meal.find({ user: { $in: userIds }, date: { $gte: threeDaysAgo } })
            .populate('user', 'name')
            .sort({ date: -1 });
        const workoutsPromise = Workout.find({ user: { $in: userIds }, date: { $gte: threeDaysAgo } })
            .populate('user', 'name')
            .sort({ date: -1 });
        const [meals, workouts] = await Promise.all([mealsPromise, workoutsPromise]);
        const feed = [
            ...meals.map(m => ({ ...m.toObject(), type: 'meal' })),
            ...workouts.map(w => ({ ...w.toObject(), type: 'workout' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(feed);
    } catch (err) {
        console.error("Activity Feed Error:", err);
        res.status(500).send('Server Error');
    }
});
// @route   GET api/friends/profile/:userId
router.get('/profile/:userId', auth, async (req, res) => {
    try {
        const profileUser = await User.findById(req.params.userId).select('name goal createdAt');
        if (!profileUser) {
            return res.status(404).json({ msg: 'User not found' });
        }
        const totalWorkouts = await Workout.countDocuments({ user: req.params.userId });
        const totalMeals = await Meal.countDocuments({ user: req.params.userId });
        res.json({
            profile: profileUser,
            stats: {
                totalWorkouts,
                totalMeals,
            }
        });
    } catch (err) {
        console.error("Fetch friend profile error:", err);
        res.status(500).send('Server Error');
    }
});

// --- ADD THIS NEW ROUTE ---
// @route   GET api/friends/suggestions
// @desc    Suggest friends based on friends of friends
// @access  Private
router.get('/suggestions', auth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id);
        if (!currentUser || !currentUser.friends || currentUser.friends.length === 0) {
            return res.json([]);
        }

        const friendsOfFriends = await User.aggregate([
            { $match: { _id: { $in: currentUser.friends } } },
            { $project: { friends: 1, _id: 0 } },
            { $unwind: '$friends' },
            { $group: { _id: '$friends' } }
        ]);

        const suggestedIds = friendsOfFriends.map(fof => fof._id);

        const existingConnections = [
            ...currentUser.friends,
            ...(currentUser.friendRequestsSent || []),
            currentUser._id
        ];
        
        const finalSuggestionsIds = suggestedIds.filter(id => 
            !existingConnections.some(connId => connId.equals(id))
        );

        const suggestions = await User.find({
            _id: { $in: finalSuggestionsIds }
        }).select('name').limit(5);

        res.json(suggestions);

    } catch (err) {
        console.error("Friend Suggestion Error:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;