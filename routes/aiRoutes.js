const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.js');
const User = require('../models/User.js');
const fetch = require('node-fetch');

// ---------------------- //
// @route POST api/ai/recommend-meal
// ---------------------- //
router.post('/recommend-meal', auth, async (req, res) => {
  try {
    const { currentCalories } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    let dailyCalorieTarget = 2000;
    const { weight, height, age, gender, activityLevel } = user;

    if (weight && height && age && gender && activityLevel) {
      let bmr = 0;

      if (gender === 'Male') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else if (gender === 'Female') {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }

      const activityMultipliers = {
        'Sedentary': 1.2,
        'Lightly Active': 1.375,
        'Moderately Active': 1.55,
        'Very Active': 1.725
      };

      const multiplier = activityMultipliers[activityLevel] || 1.2;
      dailyCalorieTarget = Math.round(bmr * multiplier);
    }

    const caloriesRemaining = dailyCalorieTarget - currentCalories;

    if (caloriesRemaining <= 0) {
      return res.json({
        recommendation: "You've already hit your calorie goal for today! Fantastic work."
      });
    }

    const prompt = `You are an expert fitness and nutrition coach. A user needs a meal recommendation based on their personal calorie target.
User's Daily Calorie Target: ${dailyCalorieTarget}
Calories Consumed So Far: ${currentCalories}
Calories Remaining: ${caloriesRemaining}
Based on this, suggest a single, healthy, and specific meal idea that is approximately ${caloriesRemaining} calories. Keep the response to 2-3 sentences. Be encouraging.`;

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) throw new Error(`API call failed with status: ${apiResponse.status}`);

    const result = await apiResponse.json();
    const recommendationText = result.candidates[0].content.parts[0].text;

    res.json({ recommendation: recommendationText.trim() });
  } catch (err) {
    console.error("Error calling AI API for meal recommendation:", err.message);
    res.status(500).json({ recommendation: 'Sorry, the AI coach is currently unavailable.' });
  }
});

// ---------------------- //
// @route POST api/ai/estimate-calories
// ---------------------- //
router.post('/estimate-calories', auth, async (req, res) => {
  const { mealName, quantity } = req.body;

  const prompt = `Based on the meal "${mealName}" with a quantity of "${quantity}", estimate the total calories. Provide only a single integer number as the response. For example: 350`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) throw new Error('Failed to get response from AI');

    const result = await apiResponse.json();
    const responseText = result.candidates[0].content.parts[0].text;
    const calories = parseInt(responseText.trim());

    if (isNaN(calories)) throw new Error('AI response was not a number');

    res.json({ calories });
  } catch (err) {
    console.error("Meal Calorie Estimation Error:", err.message);
    res.status(500).json({ msg: 'Could not estimate calories' });
  }
});

// ---------------------- //
// @route POST api/ai/estimate-workout-calories
// ---------------------- //
router.post('/estimate-workout-calories', auth, async (req, res) => {
  const { workoutName, duration } = req.body;

  try {
    const user = await User.findById(req.user.id).select('weight');
    const userWeight = user ? user.weight : 70;

    const prompt = `As a fitness expert, estimate the total calories burned for the following activity.
User's approximate weight: ${userWeight || 70} kg.
Activity: "${workoutName}"
Duration: "${duration}"
Provide only a single integer representing the estimated total calories burned. Do not include any other text, units, or explanations. For example: 150`;

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      throw new Error(`API call failed with status ${apiResponse.status}: ${errorBody}`);
    }

    const result = await apiResponse.json();

    if (!result.candidates || result.candidates.length === 0) {
      throw new Error('No response candidates from AI service.');
    }

    const responseText = result.candidates[0].content.parts[0].text;
    const match = responseText.match(/\d+/);

    if (match) {
      const calories = parseInt(match[0], 10);
      res.json({ caloriesBurned: calories });
    } else {
      throw new Error('Could not parse a number from the AI response.');
    }
  } catch (err) {
    console.error("Error in /estimate-workout-calories:", err.message);
    res.status(500).json({ msg: 'Failed to estimate calories due to a server error.' });
  }
});

// ---------------------- //
// @route POST api/ai/analyze-progress
// ---------------------- //
router.post('/analyze-progress', auth, async (req, res) => {
  const { calorieData, workoutData, userProfile } = req.body;

  let calorieSummary = 'No detailed calorie data available.';
  if (calorieData && calorieData.labels && calorieData.datasets) {
    calorieSummary = calorieData.labels.map((day, index) => `- ${day}: ${calorieData.datasets[0].data[index]} kcal`).join('\n');
  }

  let workoutSummary = 'No detailed workout data available.';
  if (workoutData && workoutData.labels && workoutData.datasets) {
    workoutSummary = workoutData.labels.map((day, index) => `- ${day}: ${workoutData.datasets[0].data[index]} minutes`).join('\n');
  }

  const weeklySummary = `
User's Goal: ${userProfile.goal || 'Not set'}
User's Profile Details: Age ${userProfile.age || 'N/A'}, Weight ${userProfile.weight || 'N/A'} kg, Height ${userProfile.height || 'N/A'} cm.
Last 7 Days Calorie Intake:
${calorieSummary}
Last 7 Days Workouts:
${workoutSummary}
`;

  const prompt = `You are an expert fitness and nutrition coach reviewing a user's weekly data.
Here is the summary:
${weeklySummary}
Based on this data, provide a short (3-4 sentences), encouraging, and insightful analysis. Comment on their consistency, calorie intake relative to common goals, and provide one specific, actionable tip for the upcoming week. Address the user directly.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ msg: 'AI service is not configured.' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!apiResponse.ok) {
      throw new Error('Failed to fetch from AI API');
    }

    const result = await apiResponse.json();
    const analysisText = result.candidates[0].content.parts[0].text;

    res.json({ analysis: analysisText.trim() });
  } catch (err) {
    console.error("Error calling AI analysis API:", err.message);
    res.status(500).json({ msg: 'Sorry, the AI coach is currently unavailable.' });
  }
});

// ---------------------- //
// @route POST api/ai/chat
// ---------------------- //
router.post('/chat', auth, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;

  if (!message) {
    return res.status(400).json({ msg: 'Message is required.' });
  }

  try {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found.' });
    }

    const prompt = `You are FitBot, a friendly and motivational fitness assistant.
A user is asking for advice. Use their profile information to give a personalized, helpful, and concise response (3-4 sentences).
User Profile:
- Name: ${user.name}
- Stated Goal: ${user.goal}
- Weight: ${user.weight || 'Not set'} kg
- Height: ${user.height || 'Not set'} cm
- Age: ${user.age || 'Not set'}
- Activity Level: ${user.activityLevel || 'Not set'}
User's Message: "${message}"
Your Response:`;

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      throw new Error('Failed to get response from AI');
    }

    const result = await apiResponse.json();
    const botResponse = result.candidates[0].content.parts[0].text;

    res.json({ reply: botResponse.trim() });
  } catch (err) {
    console.error("Error in /api/ai/chat:", err.message);
    res.status(500).json({ msg: 'Sorry, FitBot is currently unavailable.' });
  }
});

// ---------------------- //
// @route POST api/ai/goal-tips
// ---------------------- //
router.post('/goal-tips', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.goalType || !user.targetWeight) {
      return res.status(400).json({ msg: 'User goal not set.' });
    }

    const currentWeight = user.weight || user.targetWeight || 70;
    const activityLevel = user.activityLevel || 'Moderately Active';

    const prompt = `You are an expert fitness and nutrition coach. A user needs advice to reach their weight goal.
User's Profile:
- Current Weight: ${currentWeight} kg
- Goal Type: ${user.goalType}
- Target Weight: ${user.targetWeight} kg
- Activity Level: ${activityLevel}
Based on this, provide 3 short, encouraging, and highly actionable tips to help them progress. Format the response as a simple list with bullet points or dashes.`;

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) throw new Error('Failed to get AI response');

    const result = await response.json();
    const tips = result.candidates[0].content.parts[0].text;

    res.json({ tips });
  } catch (err) {
    console.error("AI Goal Tips Error:", err.message);
    res.status(500).json({ msg: 'Could not get AI tips at this time.' });
  }
});

module.exports = router;
