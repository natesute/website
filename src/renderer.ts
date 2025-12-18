import { GrowthSimulation } from './simulation/growth-simulation';
import renderShaderCode from './shaders/render-pixels.wgsl?raw';

/**
 * Renders the growth simulation as discrete pixels.
 */
export class Renderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private simulation: GrowthSimulation;
  
  // Underline region (normalized coords): x, y, width, height
  private underlineRegion: [number, number, number, number] = [0, 0, 0, 0];

  constructor(device: GPUDevice, format: GPUTextureFormat, simulation: GrowthSimulation) {
    this.device = device;
    this.simulation = simulation;

    const shaderModule = device.createShaderModule({
      label: 'Render Shader',
      code: renderShaderCode,
    });

    // Uniform buffer: time, simWidth, simHeight, isGrowing, underline (x, y, w, h)
    this.uniformBuffer = device.createBuffer({
      label: 'Render Uniforms',
      size: 32, // 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Render Pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'Render Bind Group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simulation.getCurrentStateBuffer() } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });

    // Initial uniform values
    const { width, height } = simulation.getDimensions();
    const uniformData = new Float32Array([0, width, height, 0, 0, 0, 0, 0]);
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  /**
   * Set the underline region (normalized 0-1 coords)
   */
  setUnderline(x: number, y: number, width: number, height: number) {
    this.underlineRegion = [x, y, width, height];
  }

  /**
   * Clear the underline
   */
  clearUnderline() {
    this.underlineRegion = [0, 0, 0, 0];
  }

  /**
   * Update bind group when buffer changes
   */
  updateBindGroup() {
    this.bindGroup = this.device.createBindGroup({
      label: 'Render Bind Group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simulation.getCurrentStateBuffer() } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  /**
   * Render current state
   */
  render(encoder: GPUCommandEncoder, view: GPUTextureView, time: number, _isGrowing: boolean) {
    const { width, height } = this.simulation.getDimensions();
    const [ux, uy, uw, uh] = this.underlineRegion;
    const uniformData = new Float32Array([time, width, height, 0, ux, uy, uw, uh]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0.082, g: 0.082, b: 0.082, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(4);
    pass.end();
  }
}
