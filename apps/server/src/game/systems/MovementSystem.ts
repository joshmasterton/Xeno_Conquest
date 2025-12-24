import { RoadEdge, Unit } from '@xeno/shared';

export function updateUnitPosition(unit: Unit, edge: RoadEdge, deltaTime: number): Unit {
	unit.distanceOnEdge += unit.speed * deltaTime;

	if (unit.distanceOnEdge >= edge.length) {
		unit.distanceOnEdge = edge.length;
	}

	return unit;
}
