import growthShader from './growth.wgsl?raw';

/**
 * Growth Cellular Automaton with age tracking.
 * Each cell stores: (on/off, age)
 */
export class GrowthSimulation {
  readonly width: number;
  readonly height: number;
  
  private device: GPUDevice;
  private pipeline: GPUComputePipeline;
  private bindGroups: GPUBindGroup[];
  private stateBuffers: GPUBuffer[];
  private maskBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private currentBuffer = 0;
  
  private maskData: Uint32Array;
  private isComplete = false;
  private stepCount = 0;

  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;
    this.width = width;
    this.height = height;

    const shaderModule = device.createShaderModule({
      label: 'Growth Shader',
      code: growthShader,
    });

    this.pipeline = device.createComputePipeline({
      label: 'Growth Pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // State buffers: vec2<u32> per cell (on/off, age)
    const stateSize = width * height * 2 * 4; // 2 u32s × 4 bytes
    this.stateBuffers = [
      device.createBuffer({
        label: 'State Buffer A',
        size: stateSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      device.createBuffer({
        label: 'State Buffer B',
        size: stateSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    ];

    // Mask buffer
    const maskSize = width * height * 4;
    this.maskBuffer = device.createBuffer({
      label: 'Mask Buffer',
      size: maskSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.maskData = new Uint32Array(width * height);

    // Uniforms
    this.uniformBuffer = device.createBuffer({
      label: 'Uniform Buffer',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformData = new Float32Array([0, width, height, 0]);
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    // Create bind groups
    this.bindGroups = [
      device.createBindGroup({
        label: 'Bind Group A->B',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
          { binding: 1, resource: { buffer: this.stateBuffers[1] } },
          { binding: 2, resource: { buffer: this.maskBuffer } },
          { binding: 3, resource: { buffer: this.uniformBuffer } },
        ],
      }),
      device.createBindGroup({
        label: 'Bind Group B->A',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.stateBuffers[0] } },
          { binding: 2, resource: { buffer: this.maskBuffer } },
          { binding: 3, resource: { buffer: this.uniformBuffer } },
        ],
      }),
    ];

    this.reset();
  }

  reset() {
    // State is vec2<u32> per cell
    const data = new Uint32Array(this.width * this.height * 2);
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, data);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, data);
    this.isComplete = false;
    this.stepCount = 0;
  }

  setMaskFromImage(
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number
  ) {
    this.reset();
    
    // State data: vec2<u32> per cell
    const stateData = new Uint32Array(this.width * this.height * 2);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const imgX = Math.floor((x / this.width) * imageWidth);
        const imgY = Math.floor((y / this.height) * imageHeight);
        const imgIdx = (imgY * imageWidth + imgX) * 4;
        const value = imageData[imgIdx] > 64 ? 1 : 0;
        
        const idx = y * this.width + x;
        this.maskData[idx] = value;
      }
    }
    
    this.device.queue.writeBuffer(this.maskBuffer, 0, this.maskData as Uint32Array<ArrayBuffer>);
    
    // Place seeds using connected components
    this.placeSeeds(stateData);
    
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, stateData);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, stateData);
  }

  private placeSeeds(stateData: Uint32Array) {
    const visited = new Uint8Array(this.width * this.height);
    const components: number[][] = [];
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (this.maskData[idx] === 1 && visited[idx] === 0) {
          const component: number[] = [];
          this.floodFill(x, y, visited, component);
          if (component.length > 0) {
            components.push(component);
          }
        }
      }
    }
    
    // Place exactly 1 random seed in each component
    // State is vec2, so index is idx * 2
    for (const component of components) {
      const randomIdx = Math.floor(Math.random() * component.length);
      const cellIdx = component[randomIdx];
      stateData[cellIdx * 2] = 1;     // on
      stateData[cellIdx * 2 + 1] = 0; // age = 0
    }
    
    console.log(`Found ${components.length} connected components, placed 1 seed each`);
  }

  private floodFill(startX: number, startY: number, visited: Uint8Array, component: number[]) {
    const stack: [number, number][] = [[startX, startY]];
    
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
      
      const idx = y * this.width + x;
      if (visited[idx] === 1 || this.maskData[idx] === 0) continue;
      
      visited[idx] = 1;
      component.push(idx);
      
      stack.push([x - 1, y]);
      stack.push([x + 1, y]);
      stack.push([x, y - 1]);
      stack.push([x, y + 1]);
    }
  }

  step() {
    if (this.isComplete) return;
    
    this.stepCount++;
    
    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroups[this.currentBuffer]);
    pass.dispatchWorkgroups(
      Math.ceil(this.width / 16),
      Math.ceil(this.height / 16)
    );
    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    this.currentBuffer = 1 - this.currentBuffer;
    
    if (this.stepCount > 60) {
      this.isComplete = true;
    }
  }

  getIsComplete(): boolean {
    return this.isComplete;
  }

  /**
   * Instantly complete the simulation - all masked cells become visible.
   * Used when returning to home page to skip the growth animation.
   */
  setComplete() {
    const stateData = new Uint32Array(this.width * this.height * 2);
    
    for (let i = 0; i < this.width * this.height; i++) {
      if (this.maskData[i] === 1) {
        stateData[i * 2] = 1;      // on
        stateData[i * 2 + 1] = 100; // high age so visibility delay is passed
      }
    }
    
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, stateData);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, stateData);
    this.isComplete = true;
  }

  /**
   * Update the mask without resetting state - for hover effects.
   * New mask regions adjacent to existing cells will grow in.
   */
  updateMask(
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number
  ) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const imgX = Math.floor((x / this.width) * imageWidth);
        const imgY = Math.floor((y / this.height) * imageHeight);
        const imgIdx = (imgY * imageWidth + imgX) * 4;
        const value = imageData[imgIdx] > 64 ? 1 : 0;
        
        const idx = y * this.width + x;
        this.maskData[idx] = value;
      }
    }
    
    this.device.queue.writeBuffer(this.maskBuffer, 0, this.maskData as Uint32Array<ArrayBuffer>);
    
    // Allow more growth steps for underline
    if (this.isComplete) {
      this.isComplete = false;
      this.stepCount = 500; // Allow steps for underline to grow
    }
  }

  getCurrentStateBuffer(): GPUBuffer {
    return this.stateBuffers[this.currentBuffer];
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
