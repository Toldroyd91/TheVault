export class SniperEngine {
    constructor(canvasId) {
        // Initialize Fabric with drawing disabled initially (we use custom line drawing)
        this.canvas = new fabric.Canvas(canvasId, { selection: false });
        this.gridSize = 20;
        this.isSnapping = true;
        this.isDrawingLine = false;
        
        this.line = null;
        this.crosshairX = null;
        this.crosshairY = null;

        this.setupGrid();
        this.setupCrosshairs();
        this.setupInteractions();
    }

    // 1. Draw the Background Grid
    setupGrid() {
        for (let i = 0; i < (this.canvas.width / this.gridSize); i++) {
            this.canvas.add(new fabric.Line([ i * this.gridSize, 0, i * this.gridSize, this.canvas.height], { stroke: '#1e293b', selectable: false, evented: false }));
            this.canvas.add(new fabric.Line([ 0, i * this.gridSize, this.canvas.width, i * this.gridSize], { stroke: '#1e293b', selectable: false, evented: false }));
        }
    }

    // 2. The Live Crosshairs
    setupCrosshairs() {
        this.crosshairX = new fabric.Line([0, 0, 0, 0], { stroke: '#0dcaf0', strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [5, 5] });
        this.crosshairY = new fabric.Line([0, 0, 0, 0], { stroke: '#0dcaf0', strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [5, 5] });
        this.canvas.add(this.crosshairX, this.crosshairY);
    }

    // 3. The Snapping & Drawing Logic
    setupInteractions() {
        this.canvas.on('mouse:move', (o) => {
            let pointer = this.canvas.getPointer(o.e);
            let x = pointer.x;
            let y = pointer.y;

            if (this.isSnapping) {
                x = Math.round(x / this.gridSize) * this.gridSize;
                y = Math.round(y / this.gridSize) * this.gridSize;
            }

            // Update Crosshairs
            this.crosshairX.set({ x1: x, y1: 0, x2: x, y2: this.canvas.height });
            this.crosshairY.set({ x1: 0, y1: y, x2: this.canvas.width, y2: y });

            // Update Line if Drawing
            if (this.isDrawingLine && this.line) {
                this.line.set({ x2: x, y2: y });
            }
            this.canvas.renderAll();
        });

        this.canvas.on('mouse:down', (o) => {
            let pointer = this.canvas.getPointer(o.e);
            let x = this.isSnapping ? Math.round(pointer.x / this.gridSize) * this.gridSize : pointer.x;
            let y = this.isSnapping ? Math.round(pointer.y / this.gridSize) * this.gridSize : pointer.y;

            this.isDrawingLine = true;
            this.line = new fabric.Line([x, y, x, y], {
                stroke: '#10b981', strokeWidth: 3, selectable: false, evented: false
            });
            this.canvas.add(this.line);
        });

        this.canvas.on('mouse:up', () => {
            this.isDrawingLine = false;
            // You can inject dimension text calculation here based on line length
        });
    }

    setBackground(imageUrl) {
        fabric.Image.fromURL(imageUrl, (img) => {
            this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas), {
                scaleX: this.canvas.width / img.width,
                scaleY: this.canvas.height / img.height,
                opacity: 0.5 // Dim background so structural lines pop
            });
        }, { crossOrigin: 'anonymous' });
    }

    exportCompressedBase64() {
        // Hides crosshairs before export
        this.crosshairX.set({ opacity: 0 }); this.crosshairY.set({ opacity: 0 });
        this.canvas.renderAll();
        const dataUrl = this.canvas.toDataURL({ format: 'jpeg', quality: 0.6 });
        this.crosshairX.set({ opacity: 1 }); this.crosshairY.set({ opacity: 1 });
        return dataUrl;
    }
}
