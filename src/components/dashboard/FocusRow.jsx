import React from 'react';
import GoalTile from './GoalTile';
import StreakTile from './StreakTile';
import ClassRankTile from './ClassRankTile';

export default function FocusRow() {
  return (
    <section className="focus-row" aria-label="Bugünün özeti">
      <GoalTile />
      <StreakTile />
      <ClassRankTile />
    </section>
  );
}
