/**
 * Task Definitions and Validation Logic
 * Defines all task types with their step-by-step validation
 */

import type { GameTask, TaskType } from '@elizagames/shared';

export function createAllTasks(): Map<string, GameTask> {
  const tasks = new Map<string, GameTask>();

  // ============================================================================
  // Wiring Tasks (multiple locations)
  // ============================================================================

  tasks.set('wiring-electrical', {
    id: 'wiring-electrical',
    type: 'wiring',
    room: 'electrical',
    description: 'Connect colored wires in Electrical',
    steps: [
      {
        description: 'Connect red wire',
        validation: (input) => input.toLowerCase().includes('red')
      },
      {
        description: 'Connect blue wire',
        validation: (input) => input.toLowerCase().includes('blue')
      },
      {
        description: 'Connect yellow wire',
        validation: (input) => input.toLowerCase().includes('yellow')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  tasks.set('wiring-security', {
    id: 'wiring-security',
    type: 'wiring',
    room: 'security',
    description: 'Connect colored wires in Security',
    steps: [
      {
        description: 'Connect green wire',
        validation: (input) => input.toLowerCase().includes('green')
      },
      {
        description: 'Connect pink wire',
        validation: (input) => input.toLowerCase().includes('pink')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Fuel Tasks (two-part: download then upload)
  // ============================================================================

  tasks.set('fuel-download', {
    id: 'fuel-download',
    type: 'fuel-download',
    room: 'storage',
    description: 'Download fuel data in Storage',
    steps: [
      {
        description: 'Start download',
        validation: (input) => input.toLowerCase().includes('download') || input.toLowerCase().includes('start')
      }
    ],
    completedBy: new Set(),
    isMultiPart: true,
    linkedTaskId: 'fuel-upload'
  });

  tasks.set('fuel-upload', {
    id: 'fuel-upload',
    type: 'fuel-upload',
    room: 'engine',
    description: 'Upload fuel data in Engine Room',
    steps: [
      {
        description: 'Upload fuel data',
        validation: (input) => input.toLowerCase().includes('upload')
      }
    ],
    completedBy: new Set(),
    isMultiPart: true,
    linkedTaskId: 'fuel-download'
  });

  // ============================================================================
  // MedBay Scan
  // ============================================================================

  tasks.set('medbay-scan', {
    id: 'medbay-scan',
    type: 'scan',
    room: 'medbay',
    description: 'Submit to medical scan in MedBay',
    steps: [
      {
        description: 'Stand on scanner',
        validation: (input) => input.toLowerCase().includes('scan') || input.toLowerCase().includes('stand')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Reactor Tasks
  // ============================================================================

  tasks.set('reactor-unlock', {
    id: 'reactor-unlock',
    type: 'reactor',
    room: 'reactor',
    description: 'Enter reactor unlock sequence',
    steps: [
      {
        description: 'Enter code: 1-4-2-8',
        expectedInput: '1428',
        validation: (input) => input.replace(/\D/g, '') === '1428'
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Navigation Tasks
  // ============================================================================

  tasks.set('navigation-course', {
    id: 'navigation-course',
    type: 'navigation',
    room: 'navigation',
    description: 'Chart navigation course',
    steps: [
      {
        description: 'Set coordinates: X=45, Y=72',
        validation: (input) => {
          const hasX = input.toLowerCase().includes('45') || input.toLowerCase().includes('x') && input.includes('45');
          const hasY = input.toLowerCase().includes('72') || input.toLowerCase().includes('y') && input.includes('72');
          return hasX && hasY;
        }
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Weapons Tasks
  // ============================================================================

  tasks.set('weapons-asteroids', {
    id: 'weapons-asteroids',
    type: 'weapons',
    room: 'weapons',
    description: 'Destroy asteroids',
    steps: [
      {
        description: 'Destroy 20 asteroids',
        validation: (input) => input.toLowerCase().includes('destroy') || input.toLowerCase().includes('shoot') || input.toLowerCase().includes('fire')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Trash Tasks
  // ============================================================================

  tasks.set('trash-cafeteria', {
    id: 'trash-cafeteria',
    type: 'trash-empty',
    room: 'cafeteria',
    description: 'Empty trash chute in Cafeteria',
    steps: [
      {
        description: 'Pull trash lever',
        validation: (input) => input.toLowerCase().includes('pull') || input.toLowerCase().includes('empty') || input.toLowerCase().includes('trash')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  tasks.set('trash-storage', {
    id: 'trash-storage',
    type: 'trash-empty',
    room: 'storage',
    description: 'Empty trash in Storage',
    steps: [
      {
        description: 'Pull trash lever',
        validation: (input) => input.toLowerCase().includes('pull') || input.toLowerCase().includes('empty') || input.toLowerCase().includes('trash')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Shields Task
  // ============================================================================

  tasks.set('shields-prime', {
    id: 'shields-prime',
    type: 'shields-prime',
    room: 'shields',
    description: 'Prime shields',
    steps: [
      {
        description: 'Tap all red hexagons',
        validation: (input) => input.toLowerCase().includes('tap') || input.toLowerCase().includes('prime') || input.toLowerCase().includes('hexagon')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Engine Tasks
  // ============================================================================

  tasks.set('engine-align', {
    id: 'engine-align',
    type: 'navigation',
    room: 'engine',
    description: 'Align engine output',
    steps: [
      {
        description: 'Align engine to center position',
        validation: (input) => input.toLowerCase().includes('align') || input.toLowerCase().includes('center')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  // ============================================================================
  // Download Tasks
  // ============================================================================

  tasks.set('download-electrical', {
    id: 'download-electrical',
    type: 'fuel-download',
    room: 'electrical',
    description: 'Download data in Electrical',
    steps: [
      {
        description: 'Download data',
        validation: (input) => input.toLowerCase().includes('download')
      }
    ],
    completedBy: new Set(),
    isMultiPart: false
  });

  return tasks;
}

// ============================================================================
// Task Assignment Logic
// ============================================================================

export function assignTasksToPlayer(
  allTasks: Map<string, GameTask>,
  count: number
): string[] {
  const availableTasks = Array.from(allTasks.keys());
  
  // Fisher-Yates shuffle for uniform random distribution
  const shuffled = [...availableTasks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, count);
}

// ============================================================================
// Task Validation Logic
// ============================================================================

export function validateTaskCompletion(
  task: GameTask,
  input: string,
  currentStep: number = 0
): { success: boolean; nextStep: number; completed: boolean; message: string } {
  if (currentStep >= task.steps.length) {
    return {
      success: false,
      nextStep: currentStep,
      completed: false,
      message: 'Task already completed'
    };
  }

  const step = task.steps[currentStep];
  const isValid = step.validation(input);

  if (!isValid) {
    return {
      success: false,
      nextStep: currentStep,
      completed: false,
      message: `Invalid input. Expected: ${step.description}`
    };
  }

  const nextStep = currentStep + 1;
  const completed = nextStep >= task.steps.length;

  return {
    success: true,
    nextStep,
    completed,
    message: completed
      ? `✅ Task completed: ${task.description}`
      : `Step ${nextStep}/${task.steps.length}: ${task.steps[nextStep].description}`
  };
}

// ============================================================================
// Task Progress Tracking
// ============================================================================

export function getPlayerTaskProgress(
  taskIds: string[],
  completedTaskIds: string[]
): { total: number; completed: number; percentage: number } {
  const total = taskIds.length;
  const completed = completedTaskIds.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percentage };
}

export function getAllTaskProgress(
  tasks: Map<string, GameTask>
): { total: number; completed: number; percentage: number } {
  let totalTasks = 0;
  let completedTasks = 0;

  for (const task of tasks.values()) {
    totalTasks++;
    // NOTE: This counts unique tasks completed by anyone
    // In real Among Us, progress is based on total task instances across all players
    // This is a simplified implementation - proper fix would require player task assignments
    if (task.completedBy.size > 0) {
      completedTasks++;
    }
  }

  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return { total: totalTasks, completed: completedTasks, percentage };
}

// ============================================================================
// Task Requirements
// ============================================================================

export function canCompleteTask(
  task: GameTask,
  playerLocation: string,
  completedTaskIds: string[]
): { canComplete: boolean; reason?: string } {
  // Must be in correct room
  if (playerLocation !== task.room) {
    return {
      canComplete: false,
      reason: `You must be in ${task.room} to complete this task`
    };
  }

  // Check if linked task is required first
  if (task.linkedTaskId && task.type === 'fuel-upload') {
    if (!completedTaskIds.includes(task.linkedTaskId)) {
      return {
        canComplete: false,
        reason: 'You must complete fuel download first'
      };
    }
  }

  return { canComplete: true };
}

