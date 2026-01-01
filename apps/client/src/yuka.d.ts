declare module 'yuka' {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    squaredLength(): number;
    length(): number;
  }

  export class Vehicle {
    position: Vector3;
    velocity: Vector3;
    maxSpeed: number;
    mass: number;
    steering: SteeringManager;
    boundingRadius?: number;
  }

  export class SteeringManager {
    add(behavior: SteeringBehavior): this;
  }

  export class SteeringBehavior {
    weight: number;
  }

  export class ArriveBehavior extends SteeringBehavior {
    constructor(targetVector: Vector3, deceleration: number, tolerance: number);
  }

  export class SeparationBehavior extends SteeringBehavior {
    constructor();
  }

  export class AlignmentBehavior extends SteeringBehavior {
    constructor();
  }

  export class WanderBehavior extends SteeringBehavior {
    constructor();
  }

  export class FleeBehavior extends SteeringBehavior {
    constructor(target: Vector3, panicDistance: number);
    target: Vector3;
  }

  export class EntityManager {
    add(entity: Vehicle): void;
    remove(entity: Vehicle): void;
    update(delta: number): void;
  }

  export class Time {
    update(): this;
    getDelta(): number;
  }
}
