# Workout Generation Workflow

This workflow orchestrates multiple specialized agents to generate a complete personalized workout program.

## 1. Initial Analysis (Parallel)

Exercise selection and workout planning can run in parallel since they depend only on initial input.

```yaml
parallel:
  weight: 20
  branches:
    - - call: workers/exercise-selector
        input:
          goals: ${input.goals}
          constraints: ${input.constraints}
          preferences: ${input.preferences}
          availableExercises: ${input.availableExercises}
          userProfile: ${input.userProfile}
        store: selectedExercises
    - - call: workers/workout-planner
        input:
          goals: ${input.goals}
          userProfile: ${input.userProfile}
          exercises: ${input.exerciseCatalog}
          daysPerWeek: ${input.goals.daysPerWeek}
          sessionDuration: ${input.goals.sessionDuration}
        store: weeklySchedule
```

## 2. Calculate Progression Matrix

Uses the weekly schedule from planner to calculate intensity/volume progression across weeks.

```yaml
call: workers/progression-calculator
weight: 15
input:
  goals: ${input.goals}
  userProfile: ${input.userProfile}
  schedule: ${artifacts.weeklySchedule.weeklySchedule}
  oneRepMaxData: ${input.oneRepMaxData}
  durationWeeks: ${input.goals.duration}
store: progressionMatrix
```

## 3. Generate Week 1 (mode: week1)

Creates the complete Week 1 template with all exercises, sets, reps using selected exercises and planned structure.

```yaml
call: workers/day-generator
weight: 25
input:
  mode: week1
  weekNumber: 1
  schedule: ${artifacts.weeklySchedule.weeklySchedule}
  exercises: ${artifacts.selectedExercises.exercises}
  progression: ${artifacts.progressionMatrix.weeks}
  userProfile: ${input.userProfile}
  expectedDayCount: ${input.goals.daysPerWeek}
  sessionDuration: ${input.goals.sessionDuration}
store: week1Template
```

## 3.1. Validate Exercise IDs (Transform)

**Critical programmatic step**: Validates and corrects all exercise IDs against the catalog.
This ensures AI-generated exercise names/IDs are mapped to real database IDs.

```yaml
transform: merge-exercises
weight: 5
input:
  week1Template: ${artifacts.week1Template}
  exerciseCatalog: ${input.exerciseCatalog}
store: validatedWeek1
```

## 4. Post-Processing (Parallel)

Progression diff generation and validation can run in parallel as they both depend on the **validated** Week 1 template (with corrected exercise IDs).

```yaml
parallel:
  weight: 25
  branches:
    - - call: workers/progression-diff-generator
        input:
          week1Template: ${artifacts.validatedWeek1.validatedWeek1}
          durationWeeks: ${input.goals.duration}
          progressionMatrix: ${artifacts.progressionMatrix.weeks}
          userProfile: ${input.userProfile}
        store: progressionDiffs
    - - call: workers/validator
        input:
          week1: ${artifacts.validatedWeek1.validatedWeek1}
          goals: ${input.goals}
          userProfile: ${input.userProfile}
        store: validationResult
```

## 5. Assemble Final Program

Pure TypeScript transform that clones Week 1 and applies progression diffs to create all weeks.

```yaml
transform: assembleWeeksFromDiffs
weight: 10
input:
  week1Template: ${artifacts.validatedWeek1.validatedWeek1}
  progressionDiffs: ${artifacts.progressionDiffs}
  durationWeeks: ${input.goals.duration}
  goals: ${input.goals}
  userProfile: ${input.userProfile}
  exerciseCatalog: ${artifacts.selectedExercises.exercises}
store: finalProgram
```
