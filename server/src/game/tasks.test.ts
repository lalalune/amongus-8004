/**
 * Tasks Module Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  createAllTasks,
  assignTasksToPlayer,
  validateTaskCompletion,
  getPlayerTaskProgress,
  getAllTaskProgress,
  canCompleteTask
} from './tasks';

describe('Tasks', () => {
  describe('Task Creation', () => {
    test('should create all tasks', () => {
      const tasks = createAllTasks();
      expect(tasks.size).toBeGreaterThan(0);
    });

    test('should have wiring tasks', () => {
      const tasks = createAllTasks();
      expect(tasks.has('wiring-electrical')).toBe(true);
      expect(tasks.has('wiring-security')).toBe(true);
    });

    test('should have fuel tasks with linkage', () => {
      const tasks = createAllTasks();
      const fuelDownload = tasks.get('fuel-download');
      const fuelUpload = tasks.get('fuel-upload');

      expect(fuelDownload).toBeDefined();
      expect(fuelUpload).toBeDefined();
      expect(fuelDownload?.linkedTaskId).toBe('fuel-upload');
      expect(fuelUpload?.linkedTaskId).toBe('fuel-download');
    });

    test('should have tasks in correct rooms', () => {
      const tasks = createAllTasks();
      const wiringElectrical = tasks.get('wiring-electrical');
      expect(wiringElectrical?.room).toBe('electrical');

      const medbayTest = tasks.get('medbay-scan');
      expect(medbayTest?.room).toBe('medbay');
    });
  });

  describe('Task Assignment', () => {
    test('should assign random tasks to player', () => {
      const tasks = createAllTasks();
      const assigned = assignTasksToPlayer(tasks, 5);

      expect(assigned.length).toBe(5);
      expect(new Set(assigned).size).toBe(5); // All unique
    });

    test('should assign requested number of tasks', () => {
      const tasks = createAllTasks();
      const assigned = assignTasksToPlayer(tasks, 3);
      expect(assigned.length).toBe(3);
    });

    test('should handle requesting more tasks than available', () => {
      const tasks = createAllTasks();
      const assigned = assignTasksToPlayer(tasks, 1000);
      expect(assigned.length).toBeLessThanOrEqual(tasks.size);
    });
  });

  describe('Task Validation', () => {
    test('should validate correct task input', () => {
      const tasks = createAllTasks();
      const wiringTask = tasks.get('wiring-electrical')!;

      const result = validateTaskCompletion(wiringTask, 'connect red wire', 0);
      expect(result.success).toBe(true);
    });

    test('should reject incorrect task input', () => {
      const tasks = createAllTasks();
      const wiringTask = tasks.get('wiring-electrical')!;

      const result = validateTaskCompletion(wiringTask, 'wrong input', 0);
      expect(result.success).toBe(false);
    });

    test('should track multi-step tasks', () => {
      const tasks = createAllTasks();
      const wiringTask = tasks.get('wiring-electrical')!;

      // Step 1
      let result = validateTaskCompletion(wiringTask, 'red', 0);
      expect(result.success).toBe(true);
      expect(result.completed).toBe(false);
      expect(result.nextStep).toBe(1);

      // Step 2
      result = validateTaskCompletion(wiringTask, 'blue', 1);
      expect(result.success).toBe(true);
      expect(result.completed).toBe(false);
      expect(result.nextStep).toBe(2);

      // Step 3 (final)
      result = validateTaskCompletion(wiringTask, 'yellow', 2);
      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
    });

    test('should validate reactor code correctly', () => {
      const tasks = createAllTasks();
      const reactorTask = tasks.get('reactor-unlock')!;

      const resultCorrect = validateTaskCompletion(reactorTask, '1428', 0);
      expect(resultCorrect.success).toBe(true);

      const resultWrong = validateTaskCompletion(reactorTask, '1234', 0);
      expect(resultWrong.success).toBe(false);
    });

    test('should validate navigation coordinates', () => {
      const tasks = createAllTasks();
      const navTask = tasks.get('navigation-course')!;

      const result1 = validateTaskCompletion(navTask, 'X=45, Y=72', 0);
      expect(result1.success).toBe(true);

      const result2 = validateTaskCompletion(navTask, '45 and 72', 0);
      expect(result2.success).toBe(true);

      const resultWrong = validateTaskCompletion(navTask, 'wrong coordinates', 0);
      expect(resultWrong.success).toBe(false);
    });
  });

  describe('Task Progress', () => {
    test('should calculate player task progress', () => {
      const taskIds = ['task1', 'task2', 'task3', 'task4', 'task5'];
      const completedIds = ['task1', 'task2'];

      const progress = getPlayerTaskProgress(taskIds, completedIds);
      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(2);
      expect(progress.percentage).toBe(40);
    });

    test('should handle no tasks', () => {
      const progress = getPlayerTaskProgress([], []);
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    test('should calculate all tasks progress', () => {
      const tasks = createAllTasks();
      
      // Mark some tasks as completed
      const taskArray = Array.from(tasks.values());
      taskArray[0].completedBy.add('player1');
      taskArray[1].completedBy.add('player1');

      const progress = getAllTaskProgress(tasks);
      expect(progress.total).toBe(tasks.size);
      expect(progress.completed).toBe(2);
    });
  });

  describe('Task Requirements', () => {
    test('should allow task in correct room', () => {
      const tasks = createAllTasks();
      const task = tasks.get('wiring-electrical')!;

      const result = canCompleteTask(task, 'electrical', []);
      expect(result.canComplete).toBe(true);
    });

    test('should reject task in wrong room', () => {
      const tasks = createAllTasks();
      const task = tasks.get('wiring-electrical')!;

      const result = canCompleteTask(task, 'cafeteria', []);
      expect(result.canComplete).toBe(false);
      expect(result.reason).toContain('electrical');
    });

    test('should require linked task completion for fuel upload', () => {
      const tasks = createAllTasks();
      const fuelUpload = tasks.get('fuel-upload')!;

      const resultWithout = canCompleteTask(fuelUpload, 'engine', []);
      expect(resultWithout.canComplete).toBe(false);
      expect(resultWithout.reason).toContain('fuel download first');

      const resultWith = canCompleteTask(fuelUpload, 'engine', ['fuel-download']);
      expect(resultWith.canComplete).toBe(true);
    });
  });
});

