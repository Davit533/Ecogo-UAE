import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupPoints,nextStreak,dubaiDay,distanceMeters,isAdmin} from '../src/lib/domain';
test('cleanup points are bounded and severity increases credit',()=>{assert.equal(cleanupPoints(1),20);assert.equal(cleanupPoints(3),40);assert.equal(cleanupPoints(500),60);assert.equal(cleanupPoints(5,99),100);});
test('streaks use UAE calendar boundaries and do not double count',()=>{assert.equal(dubaiDay(new Date('2026-10-04T21:00:00Z')),'2026-10-05');assert.deepEqual(nextStreak('2026-10-03',3,7,'2026-10-04'),{current:4,longest:7,day:'2026-10-04'});assert.equal(nextStreak('2026-10-04',3,7,'2026-10-04').current,3);assert.equal(nextStreak('2026-10-01',9,9,'2026-10-04').current,1);});
test('geographic proximity is measured, not inferred from place names',()=>{assert.equal(distanceMeters(25,55,25,55),0);assert.ok(distanceMeters(25,55,25.001,55)>100);});
test('administration is based on roles, not display names',()=>{assert.equal(isAdmin('David'),false);assert.equal(isAdmin('VOLUNTEER'),false);assert.equal(isAdmin('CHILD'),false);assert.equal(isAdmin('OWNER'),true);assert.equal(isAdmin('MODERATOR'),true);});
