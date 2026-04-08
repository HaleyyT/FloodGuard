# FloodGuard

FloodGuard is a flood-awareness prototype focused on **Parramatta, NSW**. It combines **local weather observations, rainfall gauge data, and river-context signals** into a single explainable dashboard to help users understand changing local flood conditions. 

## Why FloodGuard

Flood-related information is often scattered across multiple public sources. FloodGuard brings key local signals into one place so residents and planners can more easily see:

- what is happening locally
- which signals are contributing to risk
- what actions may matter next

## Current MVP

The current prototype includes:

- Parramatta-focused dashboard
- weather observation integration
- nearby rainfall trend visualisation
- river-context integration
- explainable signal summary
- evidence and action-oriented dashboard panels

## Tech Stack

- React
- Vite
- Recharts
- Normalised local JSON data

## Data Approach

FloodGuard uses a **real-data-informed prototype pipeline**:

1. Public source files are collected
2. Raw data is normalised into a consistent internal format
3. The frontend reads from this unified structure
4. Dashboard cards, charts, and summaries are generated from those signals

This makes the prototype easier to explain, maintain, and extend.

## Run Locally

### Requirements
- Node.js 20.19+ or 22.12+
- npm

### Start the app
```bash
git clone https://github.com/HaleyyT/FloodGuard.git
cd FloodGuard/floodguard-frontend
npm install
npm run dev