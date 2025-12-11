/**
 * ParabolaWhat? - Educational Parabola App
 */

// Utility Functions
const Utils = {
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    randomFloat: (min, max, precision = 1) => parseFloat((Math.random() * (max - min) + min).toFixed(precision)),
    pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};

/**
 * Coordinate System and Plotting
 */
class Plotter {
    constructor(canvasOrId) {
        if (typeof canvasOrId === 'string') {
            this.canvas = document.getElementById(canvasOrId);
        } else {
            this.canvas = canvasOrId;
        }

        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            // Handle High DPI
            const dpr = window.devicePixelRatio || 1;
            
            // Get size from CSS or offset (which includes borders, but clientWidth doesn't?)
            // We want just the content box ideally, but canvas defaults to using width/height attrs if not set.
            // Let's rely on getBoundingClientRect() which is strictly what the user sees.
            const rect = this.canvas.getBoundingClientRect();
            
            // Fix for 0-size if hidden (e.g. display:none)
            let width = rect.width;
            let height = rect.height;
            
            if (width === 0 || height === 0) {
                 // Try getting from inline styles or attributes fallback
                 width = parseInt(this.canvas.style.width) || this.canvas.width;
                 height = parseInt(this.canvas.style.height) || this.canvas.height;
            }

            // Set internal buffer size (Physical Pixels)
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            
            // LOGICAL SIZE (CSS Pixels)
            this.width = width;
            this.height = height;

            // Scale context so all drawing commands use CSS pixels
            this.ctx.scale(dpr, dpr);
            
            this.scale = 40; // Pixels per unit
            this.origin = { x: this.width / 2, y: this.height / 2 };
        }
    }

    clear() {
        // Clear using logical dimensions (automatically scaled by ctx transform)
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawGrid();
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#e9d5ff'; // Very light purple
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        
        // Vertical grid lines
        for (let x = this.origin.x % this.scale; x < this.width; x += this.scale) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        // Horizontal grid lines
        for (let y = this.origin.y % this.scale; y < this.height; y += this.scale) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();

        // Axes
        ctx.strokeStyle = '#7e22ce'; // Darker purple
        ctx.lineWidth = 2;
        ctx.beginPath();
        // X Axis
        ctx.moveTo(0, this.origin.y);
        ctx.lineTo(this.width, this.origin.y);
        // Y Axis
        ctx.moveTo(this.origin.x, 0);
        ctx.lineTo(this.origin.x, this.height);
        ctx.stroke();
    }

    worldToScreen(x, y) {
        return {
            x: this.origin.x + x * this.scale,
            y: this.origin.y - y * this.scale
        };
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.origin.x) / this.scale,
            y: -(sy - this.origin.y) / this.scale
        };
    }

    resize() {
        // Recalculate size based on current DOM state
        // Use clientWidth/Height to get Content Box size (excluding borders)
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        
        // Check if dimensions OR dpr changed
        if (Math.abs(width - this.width) < 1 && 
            Math.abs(height - this.height) < 1 &&
            Math.abs(dpr - (this.dpr || 1)) < 0.01) return false;
        
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        
        // Reset canvas resolution
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        
        // Reset scale
        this.ctx.scale(dpr, dpr);
        
        // Recalculate origin
        this.origin = { x: this.width / 2, y: this.height / 2 };
        return true;
    }

    drawParabola(a, b, c, color = '#7c3aed', thickness = 3) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        // Optimize drawing range
        // We only need to draw what's visible. 
        // x in world units.
        const xMin = -this.origin.x / this.scale;
        const xMax = (this.width - this.origin.x) / this.scale;
        
        // Draw with step dependent on scale to ensure smooth curves but efficient
        const step = 2 / this.scale; // 2 pixels per step roughly
        
        for (let x = xMin; x <= xMax; x += step) {
            const y = a * x * x + b * x + c;
            const pos = this.worldToScreen(x, y);
            if (x === xMin) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        }
        ctx.stroke();
    }
}

/**
 * Quiz Engine
 */
class QuizEngine {
    constructor() {
        this.currentMode = null;
        this.score = 0;
        this.streak = 0;
        this.stats = JSON.parse(localStorage.getItem('parabola_stats')) || {
            totalScore: 0,
            attempts: 0,
            correct: 0
        };
        
        this.ui = {
            menu: document.getElementById('menu-view'),
            quiz: document.getElementById('quiz-view'),
            mainCanvas: document.getElementById('main-canvas'),
        };

        this.plotter = new Plotter('main-canvas');
        this.bindEvents();
        this.updateStatsUI();
    }

    bindEvents() {
        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                this.startQuiz(mode);
            });
        });

        document.getElementById('exit-quiz-btn').addEventListener('click', () => {
            this.showMenu();
        });

        document.getElementById('reset-stats-btn').addEventListener('click', () => {
            if(confirm('Sei sicuro di voler resettare le statistiche?')) {
                this.stats = { totalScore: 0, attempts: 0, correct: 0 };
                this.saveStats();
                this.updateStatsUI();
            }
        });
    }

    updateStatsUI() {
        document.getElementById('total-score').textContent = this.stats.totalScore;
        const acc = this.stats.attempts > 0 
            ? Math.round((this.stats.correct / this.stats.attempts) * 100) 
            : 0;
        document.getElementById('accuracy').textContent = acc + '%';
        // HTML structure changed to use Material Icons
        const streakVal = document.getElementById('streak-val');
        if (streakVal) streakVal.textContent = this.streak;
        else document.getElementById('streak-badge').textContent = '🔥 ' + this.streak; // Fallback
    }

    saveStats() {
        localStorage.setItem('parabola_stats', JSON.stringify(this.stats));
    }

    showMenu() {
        this.ui.quiz.classList.remove('active');
        this.ui.menu.classList.add('active');
        this.updateStatsUI();
        // Close popup if open
        document.getElementById('feedback-popup').classList.add('hidden');
    }

    startQuiz(mode) {
        if (mode === 'random') {
            const modes = ['draw-plot', 'pick-plot', 'pick-eq', 'type-eq'];
            mode = Utils.pickRandom(modes);
        }
        
        this.currentMode = mode;
        this.ui.menu.classList.remove('active');
        this.ui.quiz.classList.add('active');
        
        document.getElementById('quiz-mode-label').textContent = this.getModeName(mode);
        
        this.loadQuestion();
    }

    getModeName(mode) {
        const names = {
            'draw-plot': 'Disegna il Grafico',
            'pick-plot': 'Trova il Grafico',
            'pick-eq': 'Trova l\'Equazione',
            'type-eq': 'Scrivi l\'Equazione'
        };
        return names[mode] || mode;
    }

    loadQuestion() {
        this.resetInteraction();
        this.currentQuestion = QuestionGenerator.generate(this.currentMode);
        
        switch(this.currentMode) {
            case 'draw-plot':
                this.setupDrawMode();
                break;
            case 'pick-plot':
                this.setupPickPlotMode();
                break;
            case 'pick-eq':
                this.setupPickEqMode();
                break;
            case 'type-eq':
                this.setupTypeEqMode();
                break;
        }
    }
    setupPickPlotMode() {
        const q = this.currentQuestion;
        document.getElementById('question-text').innerHTML = `Seleziona il grafico di:<br><code>y = ${q.equationDisplay}</code>`;
        
        // Hide main canvas, use options grid for canvases
        document.getElementById('main-canvas').style.display = 'none';
        const optionsDiv = document.getElementById('html-options');
        optionsDiv.classList.remove('hidden');
        
        // Generate Distractors
        let options = [q];
        while(options.length < 4) {
            const d = QuestionGenerator.generate();
            // Avoid duplicates
            if (!options.some(o => o.a === d.a && o.b === d.b && o.c === d.c)) {
                options.push(d);
            }
        }
        options = Utils.shuffle(options);
        
        options.forEach((opt, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'option-btn filled-plot';
            
            const canvas = document.createElement('canvas');
            // CSS handles visual size (100% of wrapper)
            canvas.style.width = '100%';
            canvas.style.height = '100%'; 
            canvas.style.objectFit = 'cover'; // Fill container by cropping if necessary (no distortion)
            
            // Explicitly set a high-res logical size for the thumbnail
            // Use responsive logic but ensure Plotter treats it as a fixed aspect ratio or dynamic
            // User wants "fill container".
            // We set width/height to 100% in CSS. 
            // In setupPickPlotMode, we are creating elements off-DOM first.
            // This is problematic for getBoundingClientRect.
            // We MUST append to DOM first.
            // BUT we want to ensure resolution is high.
            
            wrapper.appendChild(canvas); 
            wrapper.dataset.eq = opt.equationDisplay;
            wrapper.onclick = () => {
                // Prevent multiple clicks
                if (wrapper.classList.contains('animating') || wrapper.classList.contains('correct-final') || wrapper.classList.contains('wrong-final')) return;
                this.checkChoice(opt, q, wrapper);
            };
            optionsDiv.appendChild(wrapper);

            // Now initialized Plotter after append so we might get dimensions?
            // Actually optionsDiv might be hidden or layout reflow pending.
            // Let's force a size for buffer.
            
            const p = new Plotter(canvas);
            
            // Assume the button is roughly square-ish or rectangular.
            // Let's set a standard internal resolution that is high enough.
            const dpr = window.devicePixelRatio || 1;
            // Physical pixels
            p.canvas.width = 400 * dpr;
            p.canvas.height = 300 * dpr;
            // Logical pixels 
            p.width = 400; 
            p.height = 300;
            p.ctx.scale(dpr, dpr);
            p.origin = { x: 200, y: 150 };
            p.origin = { x: 200, y: 150 };
            p.scale = 20; // Zoom out (was 30) to see full curve better
            
            // Use this plotter instance
            
            // Use this plotter instance
            p.clear();
            p.drawParabola(opt.a, opt.b, opt.c);
        });
    }

    setupPickEqMode() {
        const q = this.currentQuestion;
        document.getElementById('question-text').textContent = "Qual è l'equazione di questa parabola?";
        
        // Draw main plot. Add small-height class for this mode.
        const mainCanvas = document.getElementById('main-canvas');
        mainCanvas.style.display = 'block';
        mainCanvas.classList.add('small-height');
        
        this.plotter.drawParabola(q.a, q.b, q.c, '#7c3aed', 5); // Thicker line (5)
        
        const optionsDiv = document.getElementById('html-options');
        optionsDiv.classList.remove('hidden');
        
        // Generate Distractors
        let options = [q];
        while(options.length < 4) {
            const d = QuestionGenerator.generate();
            if (d.equationDisplay !== q.equationDisplay) options.push(d);
        }
        options = Utils.shuffle(options);
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `<code>y = ${opt.equationDisplay}</code>`;
            btn.dataset.eq = opt.equationDisplay;
            btn.onclick = () => this.checkChoice(opt, q, btn);
            optionsDiv.appendChild(btn);
        });
    }

    setupTypeEqMode() {
        const q = this.currentQuestion;
        document.getElementById('question-text').textContent = "Scrivi l'equazione della parabola:";
        
        // Draw main plot (smaller for context)
        const mainCanvas = document.getElementById('main-canvas');
        mainCanvas.style.display = 'block';
        mainCanvas.classList.add('small-height');
        
        this.plotter.drawParabola(q.a, q.b, q.c, '#7c3aed', 5); // Thicker line (5)
        
        const optionsDiv = document.getElementById('html-options');
        optionsDiv.classList.remove('hidden');
        optionsDiv.style.gridTemplateColumns = '1fr';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'es: x^2 + 2x - 1';
        input.style.fontSize = '1.5rem';
        input.style.padding = '1rem';
        input.style.width = '100%';
        input.style.textAlign = 'center';
        input.style.borderRadius = '0.5rem';
        input.style.border = '2px solid var(--border-color)';

        const submitBtn = document.createElement('button');
        submitBtn.className = 'next-btn';
        submitBtn.textContent = 'Controlla';
        submitBtn.style.marginTop = '1rem';
        submitBtn.onclick = () => this.checkTypeAnswer(input.value, q);

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.appendChild(input);
        container.appendChild(submitBtn);
        
        optionsDiv.appendChild(container);
    }
    
    checkChoice(selected, correct, element) {
        // Stop interaction on all buttons
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach(b => b.style.pointerEvents = 'none');

        const isCorrect = (selected.equationDisplay === correct.equationDisplay);
        
        // 1. Start Animation: Fill Purple
        element.classList.add('animating');
        
        // 2. Add Icon (Check or X)
        const icon = document.createElement('span');
        icon.className = 'material-symbols-rounded option-status-icon';
        icon.textContent = isCorrect ? 'check' : 'close';
        element.appendChild(icon);
        
        setTimeout(() => {
            element.classList.add('show-icon');
        }, 100); /* Faster icon appearance */
        
        // 3. Final State
        setTimeout(() => {
            element.classList.remove('animating', 'show-icon');
            if (element.contains(icon)) icon.remove();
            
            if (isCorrect) {
                element.classList.add('correct-final');
            } else {
                element.classList.add('wrong-final');
                // Highlight correct one?
                buttons.forEach(b => {
                    if (b.dataset.eq === correct.equationDisplay) {
                        b.classList.add('correct-final');
                    }
                });
            }
            
            this.showFeedback(isCorrect, isCorrect ? "Corretto!" : "Sbagliato!");
        }, 1000); // 1.0s total duration (Faster)
    }

    checkTypeAnswer(input, q) {
        // Advanced Parsing and Scoring
        const parsed = InputAnalyzer.parseEquation(input);
        
        let score = 0;
        let maxScore = 0;
        let errors = [];
        
        // Helper to check coeff
        const checkCoeff = (name, userVal, correctVal) => {
            // Fix: parseEquation might return null if specific term missing (e.g. 0x)
            // If missing in user input, treat as 0.
            const u = userVal !== null ? userVal : 0;
            const c = correctVal;
            
            maxScore += 3;
            if (Math.abs(u - c) < 0.01) {
                score += 3;
            } else {
                if (Math.sign(u) === Math.sign(c) && u !== 0 && c !== 0) {
                    score += 1;
                    errors.push(`Coefficiente ${name} errato. (Segno corretto)`);
                } else {
                    errors.push(`Coefficiente ${name} errato. (Corretto: ${c})`);
                }
            }
        };

        checkCoeff('a (x²)', parsed.a, q.a);
        checkCoeff('b (x)', parsed.b, q.b);
        checkCoeff('c (costante)', parsed.c, q.c);
        
        const isPerfect = (score === maxScore);
        
        if (score > 0 && !isPerfect) {
            this.showPoints(score);
        }
        
        if (isPerfect) {
             this.showFeedback(true, "Perfetto! Equazione corretta.");
             this.showPoints(score + 1); // Bonus for perfection?
        } else {
            // Show errors but allow retry
            // Also partial success message if score > 0?
            // User: "write in the feedback what's wrong"
            if (score === 0) errors.unshift("Nessun coefficiente corretto.");
            else errors.unshift(`Punteggio parziale: ${score}/${maxScore}`);
            
            this.showFeedback(false, errors);
        }
    }

    showPoints(points) {
        const el = document.getElementById('points-animation');
        el.textContent = `+${points}`;
        el.classList.remove('active');
        void el.offsetWidth; // trigger reflow
        el.classList.add('active');
        
        this.stats.totalScore += points;
        this.saveStats();
        this.updateStatsUI();
    }

    resetInteraction() {
        this.plotter.clear();
        document.getElementById('html-options').classList.add('hidden');
        document.getElementById('html-options').innerHTML = '';
        
        
        // Hide popup
        document.getElementById('feedback-popup').classList.add('hidden');
        document.getElementById('retry-btn').classList.add('hidden');
        
        // Reset points animation
        const ptsEl = document.getElementById('points-animation');
        ptsEl.classList.remove('active');
        ptsEl.textContent = '';
        
        const mainCanvas = document.getElementById('main-canvas');
        mainCanvas.style.pointerEvents = 'none'; // Default disabled
        mainCanvas.style.display = 'block'; // Reset display to block
        mainCanvas.classList.remove('small-height'); // Reset size modifier
        
        // Remove old listeners if needed
    }

    setupDrawMode() {
        const q = this.currentQuestion;
        document.getElementById('question-text').innerHTML = `Disegna il grafico di:<br><code>y = ${q.equationDisplay}</code>`;
        
        const canvas = document.getElementById('main-canvas');
        canvas.style.pointerEvents = 'all';
        
        // Resize immediately to prevent jump on first click
        this.plotter.resize();
        this.plotter.clear(); // Ensure grid is drawn at correct size
        this.plotter.drawParabola(q.a, q.b, q.c, 'transparent', 0); // Implicit resize check? No just clear.
        this.plotter.clear();

        
        // Enable drawing
        this.drawingHandler = new DrawingHandler(canvas, this.plotter, (points) => {
            this.checkDrawAnswer(points);
        });
    }

    checkDrawAnswer(points) {
        if (points.length < 10) return; // Too short

        const analysis = InputAnalyzer.analyze(points, this.plotter);
        const q = this.currentQuestion;
        
        // Checks
        const concavityOk = analysis.concavity === Math.sign(q.a);
        const interceptOk = Math.abs(analysis.yIntercept - q.c) < 2.0; // Tolerance of 2 units
        
        // Slope Check: sign of b vs sign of slope at x=0
        let slopeOk = false;
        if (Math.abs(q.b) < 0.3) {
            slopeOk = Math.abs(analysis.slopeAtIntercept) < 1.0; // Should be roughly flat
        } else {
            slopeOk = Math.sign(analysis.slopeAtIntercept) === Math.sign(q.b);
        }
        
        // Roots Check
        const delta = q.b * q.b - 4 * q.a * q.c;
        let expectedRoots = 0;
        if (delta > 0.1) expectedRoots = 2;
        else if (delta < -0.1) expectedRoots = 0;
        else expectedRoots = 1;

        // Be lenient: exact match or maybe off by one if close to vertex? 
        // User said "check correct number of intercepts"
        // If vertex is very close to X axis, user might mess up. 
        // Let's enforce strict count unless delta is very small? 
        // For now, simple check.
        const rootsOk = Math.abs(analysis.xInterceptsCount - expectedRoots) <= (Math.abs(delta) < 1 ? 1 : 0);

        const isCorrect = concavityOk && interceptOk && slopeOk && rootsOk;
        
        // Feedback details
        let details = [];
        if (!concavityOk) details.push("Concavità errata");
        if (!interceptOk) details.push("Intercetta Y errata");
        if (!slopeOk) details.push("Pendenza all'origine errata");
        if (!rootsOk) details.push(`Intersezioni asse X errate (attese: ${expectedRoots})`);

        if (isCorrect) {
             this.showFeedback(true, "Ottimo lavoro!");
             // Lighter purple (#a78bfa) and thicker (4)
             this.plotter.drawParabola(q.a, q.b, q.c, '#a78bfa', 4);
             this.showPoints(10); // Fixed points for drawing?
        } else {
            this.showFeedback(false, details);
        }
    }

    showFeedback(isCorrect, messageOrErrors) {
        const popup = document.getElementById('feedback-popup');
        const msgEl = document.getElementById('feedback-message');
        const retryBtn = document.getElementById('retry-btn');
        
        // Clean up any old solution button
        const oldSolBtn = document.getElementById('show-solution-btn');
        if (oldSolBtn) oldSolBtn.remove();
        
        popup.classList.remove('hidden');
        
        // Handle List or String
        if (Array.isArray(messageOrErrors)) {
            // It's a list of errors
            let html = `<div>Riprova:</div><ul class="feedback-details-list">`;
            messageOrErrors.forEach(err => html += `<li>${err}</li>`);
            html += `</ul>`;
            msgEl.innerHTML = html;
            msgEl.className = 'feedback-message error';
        } else {
            msgEl.textContent = messageOrErrors;
            msgEl.className = 'feedback-message ' + (isCorrect ? 'success' : 'error');
        }
        
        // Toggle Column Mode class
        // Enable column mode for complex feedback (Draw Plot OR Type Eq errors)
        const useColumnLayout = (!isCorrect && (this.currentMode === 'draw-plot' || this.currentMode === 'type-eq'));
        const popupContent = popup.querySelector('.popup-content');
        
        if (useColumnLayout) {
             popupContent.classList.add('column-mode');
        } else {
             popupContent.classList.remove('column-mode');
        }
        
        // Divider CSS handles visibility based on column-mode
        // Just ensure divider element exists if we are in column mode logic
        let divider = popup.querySelector('.popup-divider');
        if (!divider) {
            divider = document.createElement('div');
            divider.className = 'popup-divider';
            msgEl.after(divider);
        }

        const actionsDiv = popup.querySelector('.popup-actions');

        // Retry / Solution Logic
        if (!isCorrect && (this.currentMode === 'draw-plot' || this.currentMode === 'type-eq')) {
            retryBtn.classList.remove('hidden');
            
            if (this.currentMode === 'draw-plot') {
                 // Retry symbol for draw (instead of bin)
                 retryBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span>';
                 retryBtn.onclick = () => {
                    popup.classList.add('hidden');
                    this.plotter.clear(); 
                };
            } else {
                // Refresh symbol for type-eq (try again, keep input)
                retryBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span>';
                retryBtn.onclick = () => {
                    popup.classList.add('hidden');
                    // Input remains
                };
            }
            
            
            // Add "Show Solution" button
            const solBtn = document.createElement('button');
            solBtn.id = 'show-solution-btn';
            solBtn.className = 'show-solution-btn';
            solBtn.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle; font-size:1.1em">visibility</span> Soluzione';
            solBtn.onclick = () => {
                const q = this.currentQuestion;
                // For Draw Plot: Draw plot
                // For Type Eq: Show equation text? Or alert?
                if (this.currentMode === 'draw-plot') {
                     // Light purple and thick
                     this.plotter.drawParabola(q.a, q.b, q.c, '#a78bfa', 4);
                } else {
                     // Type EQ solution
                     // Maybe show in popup?
                     const msgEl = document.getElementById('feedback-message');
                     // Append solution clearly
                     const solDiv = document.createElement('div');
                     solDiv.innerHTML = `<div style="margin-top:0.5rem; border-top:1px solid #eee; padding-top:0.5rem">Soluzione: <strong>y = ${q.equationDisplay}</strong></div>`;
                     msgEl.appendChild(solDiv);
                }
                solBtn.style.display = 'none'; // Hide after showing
            };
            // Insert before next button
            const nextBtn = document.getElementById('next-question-btn');
            actionsDiv.insertBefore(solBtn, nextBtn);
            
            // Layout adjustments determined by CSS column-mode logic now
             
        } else {
            retryBtn.classList.add('hidden');
        }
        
        // "Next Question" logic
        document.getElementById('next-question-btn').onclick = () => {
             popup.classList.add('hidden');
             if (isCorrect) {
                this.streak++;
                this.loadQuestion();
            } else {
                this.streak = 0;
                this.loadQuestion(); 
            }
        };
    }
}

/**
 * Question Generator
 */
class QuestionGenerator {
    static generate(mode) {
        // Generate nice coefficients
        // a: non-zero, usually +/- 0.5, 1, 2
        // b: integer -4 to 4
        // c: integer -4 to 4
        
        const a = Utils.pickRandom([-2, -1, -0.5, 0.5, 1, 2]);
        const b = Utils.randomInt(-4, 4);
        const c = Utils.randomInt(-4, 4);
        
        return {
            a, b, c,
            equationDisplay: this.formatEquation(a, b, c)
        };
    }

    static formatEquation(a, b, c) {
        let eq = '';
        
        // ax^2
        if (a === 1) eq += 'x²';
        else if (a === -1) eq += '-x²';
        else eq += `${a}x²`;
        
        // bx
        if (b > 0) eq += ` + ${b === 1 ? '' : b}x`;
        else if (b < 0) eq += ` - ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
        
        // c
        if (c > 0) eq += ` + ${c}`;
        else if (c < 0) eq += ` - ${Math.abs(c)}`;
        
        if (eq === '') return '0';
        return eq;
    }
}


/**
 * Interactions
 */
class DrawingHandler {
    constructor(canvas, plotter, onFinish) {
        this.canvas = canvas;
        this.plotter = plotter;
        this.onFinish = onFinish;
        this.points = [];
        this.isDrawing = false;
        
        // Smoothing
        this.mousePos = { x: 0, y: 0 };
        this.brushPos = { x: 0, y: 0 };
        this.isPointerDown = false;
        
        this.start = this.start.bind(this);
        this.move = this.move.bind(this);
        this.end = this.end.bind(this);
        this.loop = this.loop.bind(this);
        
        canvas.addEventListener('mousedown', this.start);
        canvas.addEventListener('mousemove', this.move);
        canvas.addEventListener('mouseup', this.end);
        canvas.addEventListener('touchstart', this.start, {passive: false});
        canvas.addEventListener('touchmove', this.move, {passive: false});
        canvas.addEventListener('touchend', this.end);
        
        this.canvas.addEventListener('mouseleave', this.end);
        window.addEventListener('mouseup', this.end);
        
        // Start render loop
        requestAnimationFrame(this.loop);
    }

    getPos(e) {
        // Unified coordinate calculation for Mouse and Touch
        // Relies on getBoundingClientRect + computed border subtraction
        // This is robust against scroll, border-box sizing, and high DPI
        
        const rect = this.canvas.getBoundingClientRect();
        
        // Get client coordinates (viewport relative)
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        // Account for borders to get to Content Box
        const computed = window.getComputedStyle(this.canvas);
        const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
        const borderTop = parseFloat(computed.borderTopWidth) || 0;
        
        return {
            x: clientX - rect.left - borderLeft,
            y: clientY - rect.top - borderTop
        };
    }

    start(e) {
        e.preventDefault();
        
        // Ensure plotter size matches display size before starting
        // This fixes alignment if canvas was resized or initialized wrong
        if (this.plotter.resize()) {
            // If resized, we might want to inform someone, but since we start new stroke, it's fine.
            this.plotter.clear(); 
        }
        
        this.isDrawing = true;
        this.isPointerDown = true;
        this.points = [];
        this.plotter.clear(); 
        
        const pos = this.getPos(e);
        this.mousePos = pos;
        this.brushPos = { ...pos }; // Snap brush to start
        
        this.points.push(this.plotter.screenToWorld(pos.x, pos.y));
        
        this.plotter.ctx.beginPath();
        this.plotter.ctx.moveTo(this.brushPos.x, this.brushPos.y);
    }

    move(e) {
        if (!this.isPointerDown) return;
        e.preventDefault();
        this.mousePos = this.getPos(e);
    }

    end(e) {
        if (!this.isDrawing) return;
        this.isPointerDown = false;
        // Don't set isDrawing=false immediately if we want to finish the stroke animation?
        // keeping it simple: finish immediately implies "lift pen"
        this.isDrawing = false;
        if (this.onFinish) this.onFinish(this.points);
    }
    
    loop() {
        if (this.isDrawing && this.isPointerDown) {
            // Lerp smoothing
            // factor 0.25 for smoother lines (less segmented)
            const factor = 0.25; 
            
            // Distance check to avoid minuscule updates
            const dx = this.mousePos.x - this.brushPos.x;
            const dy = this.mousePos.y - this.brushPos.y;
            
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                this.brushPos.x += dx * factor;
                this.brushPos.y += dy * factor;
                
                // Draw
                const worldPos = this.plotter.screenToWorld(this.brushPos.x, this.brushPos.y);
                // Only add point if strictly needed? or just add all for smoothing data?
                // Adding all might make array huge. Let's add if distance > threshold?
                // For logic check (concavity), we need data.
                this.points.push(worldPos);

                this.plotter.ctx.lineTo(this.brushPos.x, this.brushPos.y);
                this.plotter.ctx.stroke();
            }
        }
        requestAnimationFrame(this.loop);
    }
    static parseEquation(input) {
        // Clean input
        let s = input.toLowerCase().replace(/\s+/g, '').replace('y=', '');
        
        // Default coeffs
        let a = 0, b = 0, c = 0;
        
        // Extract terms handles: -x^2, +2x, -5, x^2, x
        // Regex strategy:
        // We look for patterns like: [number]x^2, [number]x, [number]
        
        // 1. Find 'a' (x^2 term)
        // Match anything ending in x^2 or x2 or x²
        // The lookahead/match ensures we grab the coefficient.
        // Cases: "-x^2" -> "-1", "x^2" -> "1", "2x^2" -> "2"
        const matchA = s.match(/([+-]?[\d\.]*)x[\^²]?2/);
        if (matchA) {
            let val = matchA[1];
            if (val === '' || val === '+') a = 1;
            else if (val === '-') a = -1;
            else a = parseFloat(val);
            // Remove from string to avoid confusion with b/c?
            // Actually simpler to match globally.
            // But 'x' is in 'x^2' so 'b' match needs care.
        }
        
        // 2. Find 'b' (x term, NOT x^2)
        // We need to verify it's not followed by ^2.
        // Regex: /([+-]?[\d\.]*)x(?![^2]?2)/
        // But the first regex didn't consume the string.
        // Let's use string replacement to remove found parts.
        
        let temp = s;
        if (matchA) temp = temp.replace(matchA[0], '');
        
        const matchB = temp.match(/([+-]?[\d\.]*)x/);
        if (matchB) {
            let val = matchB[1];
            if (val === '' || val === '+') b = 1;
            else if (val === '-') b = -1;
            else b = parseFloat(val);
            temp = temp.replace(matchB[0], '');
        }
        
        // 3. Find 'c' (constant)
        // Whatever is left? 
        // Should be a number.
        const matchC = temp.match(/([+-]?[\d\.]+)/);
        if (matchC) {
            c = parseFloat(matchC[1]);
        }
        
        return { a, b, c };
    }
}

/**
 * Input Analysis
 */
class InputAnalyzer {
    static analyze(points) {
        // Analyze the stroke
        if (points.length < 2) return null;

        // 1. Find min/max Y to determine concavity
        // Simplistic approach: check if start/end are higher than middle (concave up) or lower (concave down)
        // Better: Check average Y of ends vs average Y of center
        const start = points[0];
        const end = points[points.length - 1];
        const midIndex = Math.floor(points.length / 2);
        const mid = points[midIndex];
        
        // Concavity
        const isEndsHigher = (start.y > mid.y) && (end.y > mid.y);
        const concavity = isEndsHigher ? 1 : -1;

        // 2. Find Y-intercept (closest point to x=0)
        let closestToYAxis = points[0];
        let minDistX = Math.abs(points[0].x);
        let closestIndex = 0;

        points.forEach((p, i) => {
            if (Math.abs(p.x) < minDistX) {
                minDistX = Math.abs(p.x);
                closestToYAxis = p;
                closestIndex = i;
            }
        });
        const yIntercept = closestToYAxis.y;

        // 3. Slope at Intercept
        // Take a small window around the intercept point to calculate slope
        // If the intercept is at the very beginning/end of the array, take the immediate neighbor
        let p1, p2;
        const offset = 5; // Look 5 points ahead/back for smoothing
        
        if (closestIndex - offset >= 0) p1 = points[closestIndex - offset];
        else p1 = points[0];

        if (closestIndex + offset < points.length) p2 = points[closestIndex + offset];
        else p2 = points[points.length - 1];

        let slopeAtIntercept = 0;
        if (p2.x !== p1.x) {
            slopeAtIntercept = (p2.y - p1.y) / (p2.x - p1.x);
        }
        
        // 4. Roots / X-Intercepts
        let xInterceptsCount = 0;
        // Check for sign changes in Y across the points
        for (let i = 1; i < points.length; i++) {
            if (Math.sign(points[i].y) !== Math.sign(points[i-1].y) && points[i].y !== 0) {
                xInterceptsCount++;
            }
        }

        return {
            concavity,
            yIntercept,
            slopeAtIntercept,
            xInterceptsCount
        };
    }

    static parseEquation(input) {
        // Clean input
        let s = input.toLowerCase().replace(/\s+/g, '').replace('y=', '');
        
        // Default coeffs
        let a = 0, b = 0, c = 0;
        
        // Extract terms handles: -x^2, +2x, -5, x^2, x
        // Regex strategy:
        // We look for patterns like: [number]x^2, [number]x, [number]
        
        // 1. Find 'a' (x^2 term)
        // Match anything ending in x^2 or x2 or x²
        // The lookahead/match ensures we grab the coefficient.
        // Cases: "-x^2" -> "-1", "x^2" -> "1", "2x^2" -> "2"
        const matchA = s.match(/([+-]?[\d\.]*)x[\^²]?2/);
        if (matchA) {
            let val = matchA[1];
            if (val === '' || val === '+') a = 1;
            else if (val === '-') a = -1;
            else a = parseFloat(val);
        }
        
        // 2. Find 'b' (x term, NOT x^2)
        // We need to verify it's not followed by ^2.
        // Remove 'a' part first to avoid false positives?
        // Let's use string replacement to remove found parts.
        
        let temp = s;
        if (matchA) temp = temp.replace(matchA[0], '');
        
        const matchB = temp.match(/([+-]?[\d\.]*)x/);
        if (matchB) {
            let val = matchB[1];
            if (val === '' || val === '+') b = 1;
            else if (val === '-') b = -1;
            else b = parseFloat(val);
            temp = temp.replace(matchB[0], '');
        }
        
        // 3. Find 'c' (constant)
        // Whatever is left? 
        // Should be a number.
        const matchC = temp.match(/([+-]?[\d\.]+)/);
        if (matchC) {
            c = parseFloat(matchC[1]);
        }
        
        return { a, b, c };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log("ParabolaApp initialized");
    try {
        window.game = new QuizEngine();
    } catch (e) {
        console.error("Failed to initialize QuizEngine:", e);
    }
});
