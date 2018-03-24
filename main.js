document.addEventListener('DOMContentLoaded', main);

function main() {
    let canvas = document.querySelector('canvas.webgl');
    window.gl = initWebGL(canvas);

    let env = {
        time: 0,

        rotate: [0, -40*Math.PI/180],
        rotateDelta: [0, 0],
        rotateQuat: quat.create(),
        distance: 1,
        distanceDelta: 0,

        projectionMatrix: mat4.create(),
        viewMatrix: mat4.create(),
        viewProjectionMatrix: mat4.create(),
        viewPosition: vec3.create(),
        viewDirection: vec3.create(),

        tumble_vel: [0, 0],
        zoom_vel: 0,
        light_dir: [0.635, 0.428, 0.643],


        scene: createScene(),
    };

    initMouseEvents();
    animate();

    function initWebGL(canvas) {
        function tryContext(type) {
            try { return canvas.getContext(type, {}) }
            catch (e) { return null }
        }
        return tryContext('webgl') || tryContext('experimental-webgl');
    }

    function redraw() {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.viewport(0, 0, canvas.width, canvas.height);
        env.scene.draw(env);
    }

    function update() {
        env.scene.update(env);
        updateCamera();
    }

    function animate(time) {
        requestAnimationFrame(animate);

        if (time) {
            env.time = time;
            resize();
            update();
            redraw();
        }
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        let cw = ~~(dpr * canvas.clientWidth);
        let ch = ~~(dpr * canvas.clientHeight);
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
        }
    }

    function updateCamera() {
        // camera update
        vec2.scale(env.rotateDelta, env.rotateDelta, 0.97);
        vec2.add(env.rotate, env.rotate, env.rotateDelta);
        env.rotate[1] = clamp(env.rotate[1], -0.45*Math.PI, 0.45*Math.PI);

        env.distance = clamp(env.distance + env.distanceDelta, 0.5, 2);
        env.distanceDelta *= 0.9;

        // orbit to view matrix
        {
            let Q = env.rotateQuat;
            quat.identity(Q);
            quat.rotateY(Q, Q, env.rotate[0]);
            quat.rotateX(Q, Q, env.rotate[1]);

            vec3.set(env.viewDirection, 0, 0, -1);
            vec3.transformQuat(env.viewDirection, env.viewDirection, Q);
            vec3.scaleAndAdd(env.viewPosition, [0, 0, 0], env.viewDirection, -env.distance);

            mat4.lookAt(env.viewMatrix, env.viewPosition, [0,0,0], [0,1,0]);
        }

        // projection matrices
        const fov = 80 * Math.PI/180;
        const aspect = canvas.width / canvas.height;
        const near = 0.01;
        const far = 1000;
        mat4.perspective(env.projectionMatrix, fov, aspect, near, far);
        mat4.multiply(env.viewProjectionMatrix, env.projectionMatrix, env.viewMatrix);
    }

    function initMouseEvents() {
        let x0, y0;
        let dragging = false;

        canvas.onmousedown = e => {
            x0 = e.offsetX;
            y0 = e.offsetY;
            dragging = true;
            e.preventDefault();
        };

        document.onmousemove = e => {
            if (!dragging)
                return;

            let x = e.offsetX;
            let y = e.offsetY;

            const k = -0.001;
            env.rotateDelta[0] = 0.5 * (env.rotateDelta[0] + k * (x - x0));
            env.rotateDelta[1] = 0.5 * (env.rotateDelta[1] + k * (y - y0));

            x0 = x;
            y0 = y;
        };

        document.onmouseup = e => {
            dragging = false;
        };

        canvas.onmousewheel = e => {
            const d = 0.05 * e.wheelDelta/120;
            env.distanceDelta = lerp(env.distanceDelta, d, 0.1);
        };
    }
}

function decodeBase64(src, type) {
    var raw = atob(src);
    var len = raw.length;
    var buf = new ArrayBuffer(len);
    var dst = new Uint8Array(buf);
    for (var i = 0; i < len; ++i)
        dst[i] = raw.charCodeAt(i);
    return type ? new type(buf) : buf;
};

function createShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(shader);
        console.error('GLSL compile error:', log);
        return null;
    }
    return shader;
}

function createProgram(sources) {
    let vertexShader = createShader(gl.VERTEX_SHADER, sources.vertex);
    let fragmentShader = createShader(gl.FRAGMENT_SHADER, sources.fragment);

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var log = gl.getProgramInfoLog(program);
        console.error('GLSL link error:', log);
        return null;
    }

    let uniforms = {};
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; ++i) {
        let uniform = gl.getActiveUniform(program, i);
        uniforms[uniform.name] = gl.getUniformLocation(program, uniform.name);
    }

    let attributes = [];
    let attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < attributeCount; ++i) {
        var attribute = gl.getActiveAttrib(program, i);
        attributes[attribute.name] = gl.getAttribLocation(program, attribute.name);
    }

    return {
        id: program,
        uniforms,
        attributes,
    };
}

const MAX_BONE_COUNT = 20;

function createSceneProgram() {

    throw new Error("Unnecessary error: let's not make a scene")

    return createProgram({
        vertex: `
            #define N_BONES ${MAX_BONE_COUNT}

            varying vec3 vColor;
            varying vec2 vTexCoord;

            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec2 aTexCoord;
            attribute vec4 aBoneIndex;
            attribute vec4 aBoneWeight;

            uniform mat4 uBoneMatrices[N_BONES];
            uniform mat4 uViewProjectionMatrix;
            uniform mat4 uModelMatrix;
            uniform mat3 uNormalMatrix;
            uniform vec3 uViewPosition;
            uniform vec3 uLightDirection;

            void main()
            {
                vec3 P = aPosition;
                vec3 N = aNormal;

                {
                    // skinning
                    mat4 skinMatrix = (
                        aBoneWeight[0] * uBoneMatrices[int(aBoneIndex[0])] +
                        aBoneWeight[1] * uBoneMatrices[int(aBoneIndex[1])] +
                        aBoneWeight[2] * uBoneMatrices[int(aBoneIndex[2])] +
                        aBoneWeight[3] * uBoneMatrices[int(aBoneIndex[3])]);
                    P = (uModelMatrix * skinMatrix * vec4(P, 1.0)).xyz;
                    N = normalize(uNormalMatrix * (skinMatrix * vec4(N, 0.0)).xyz);
                }

                {
                    // lighting
                    vec3 V = normalize(uViewPosition - P);
                    vec3 L = normalize(uLightDirection);
                    vec3 H = normalize(L + V);
                    float NdotL = max(0.0, dot(N, L));
                    float NdotH = max(0.0, dot(N, H));

                    vec3 Cd = vec3(1.0);
                    vec3 C;
                    C = ((NdotL * 0.5) + 0.5) * Cd;
                    C += 0.20 * pow(NdotH, 10.0);
                    C = clamp(C, 0.0, 1.0);
                    vColor = pow(C, vec3(1.0/2.2));
                }

                vTexCoord = aTexCoord;
                gl_Position = uViewProjectionMatrix * vec4(P, 1.0);
            }
        `,

        fragment: `
            precision mediump float;
            varying vec3 vColor;
            varying vec2 vTexCoord;
            uniform sampler2D uDiffuseMap;

            void main()
            {
                vec3 C = vColor * texture2D(uDiffuseMap, vTexCoord).rgb;
                gl_FragColor = vec4(C, 1.0);
            }
        `
    });
}

function createSceneTexture() {
    let texture = gl.createTexture(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    {
        let ext = gl.getExtension('EXT_texture_filter_anisotropic');
        ext && gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    }

    {
        let image = new Image();
        image.src = 'texture.jpg';
        image.onload = function() {
            let canvas = document.createElement('canvas');
            canvas.width = canvas.height = 2048;
            let ctx = canvas.getContext('2d');
            drawTexture(ctx, image);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
        };
    }

    return texture;
}

function createScene() {
    let program = createSceneProgram();

    const normalMatrix = mat3.create();
    const modelMatrix = mat4.create();

    {
        const scale = 1/1000;
        mat4.identity(modelMatrix);
        mat4.translate(modelMatrix, modelMatrix, [0, -0.00, -0.315]);
        mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale]);
        mat3.normalFromMat4(normalMatrix, modelMatrix);
    }

    let vertexBuffer = null;
    let vertexCount = 0;
    let frameIndex = 0;
    let frameCount = 0;
    let boneCount = 0;
    let boneData = null;

    let frame_target = 160;
    let timePrev = -1;

    const boneMatrices = new Float32Array(16 * MAX_BONE_COUNT);
    function updateBoneMatrices(frame) {
        const t = frame;
        const t0 = Math.floor(t);
        const u = t - t0;

        const frame0 = clamp(t0, 0, frameCount-1);
        const frame1 = clamp(frame0 + 1, 0, frameCount-1);

        let n_elems = 16 * boneCount;
        let dp = 0;
        let sp0 = n_elems * frame0;
        let sp1 = n_elems * frame1;
        while (n_elems--)
            boneMatrices[dp++] = (1-u)*boneData[sp0++] + u*boneData[sp1++];
    }

    fetch('scene.json')
        .then(r => r.json())
        .then(o => {
            o.vertexData = decodeBase64(o.vertexData);
            o.boneData = decodeBase64(o.boneData, Float32Array);

            vertexCount = o.vertexCount;
            frameCount = o.frameCount;
            boneCount = o.boneCount;
            boneData = o.boneData;

            vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, o.vertexData, gl.STATIC_DRAW);
        });

    let texture = createSceneTexture();

    function draw(env) {
        if (!vertexCount)
            return;

        gl.useProgram(program.id);

        {
            let a = program.attributes;
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

            gl.enableVertexAttribArray(a.aPosition);
            gl.vertexAttribPointer(a.aPosition, 3, gl.FLOAT, false, 56, 0);

            gl.enableVertexAttribArray(a.aNormal);
            gl.vertexAttribPointer(a.aNormal, 3, gl.FLOAT, false, 56, 12);

            gl.enableVertexAttribArray(a.aTexCoord);
            gl.vertexAttribPointer(a.aTexCoord, 2, gl.FLOAT, false, 56, 24);

            gl.enableVertexAttribArray(a.aBoneIndex);
            gl.vertexAttribPointer(a.aBoneIndex, 4, gl.UNSIGNED_BYTE, false, 56, 36);

            gl.enableVertexAttribArray(a.aBoneWeight);
            gl.vertexAttribPointer(a.aBoneWeight, 4, gl.FLOAT, false, 56, 40);
        }

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        {
            let u = program.uniforms;
            gl.uniformMatrix4fv(u.uModelMatrix, false, modelMatrix);
            gl.uniformMatrix3fv(u.uNormalMatrix, false, normalMatrix);
            gl.uniformMatrix4fv(u.uViewProjectionMatrix, false, env.viewProjectionMatrix);
            gl.uniform3fv(u.uViewPositionMatrix, env.viewPosition);
            gl.uniform3fv(u.uLightDirection, env.light_dir);
            gl.uniformMatrix4fv(u['uBoneMatrices[0]'], false, boneMatrices);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(u.uDiffuseMap, 0);
        }

        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

        {
            let a = program.attributes;
            gl.disableVertexAttribArray(a.aPosition);
            gl.disableVertexAttribArray(a.aNormal);
            gl.disableVertexAttribArray(a.aTexCoord);
            gl.disableVertexAttribArray(a.aBoneIndex);
            gl.disableVertexAttribArray(a.aBoneWeight);
        }
    }

    function update(env) {
        if (!frameCount)
            return;

        if (timePrev < 0) {
            timePrev = env.time;
        }

        const framesPerSecond = 30;
        let dt = (env.time - timePrev) * framesPerSecond/1000;
        timePrev = env.time;

        frameIndex = clamp(frameIndex + dt, 0, frameCount-1);
        updateBoneMatrices(frameIndex);
    }

    return { draw, update };
}

function drawTexture(ctx, backgroundImage)
{
    const r0 = 51.6665665;

    let pattern = ctx.createPattern(backgroundImage, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, 2048, 2048);

    drawBox(ctx, pattern);
    drawCode(ctx);

    {
        // flip logo
        ctx.save();
        ctx.translate(2085, 0);
        ctx.scale(-1, 1);
        drawLogo(ctx);
        ctx.restore();
    }

    drawIcons(ctx);

    function drawLogo(ctx) {
        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'black';

        // e
        ctx.beginPath();
        ctx.moveTo(745.29, 1493.34);
        ctx.bezierCurveTo(764.54, 1493.34, 784.55, 1477.15, 784.55, 1458.51);
        ctx.bezierCurveTo(784.55, 1446.75, 776.15, 1436.06, 763.16, 1436.06);
        ctx.bezierCurveTo(750.33, 1436.06, 742.39, 1444.61, 742.24, 1452.4);
        ctx.bezierCurveTo(742.24, 1454.7, 743.3, 1455.15, 744.37, 1455.15);
        ctx.bezierCurveTo(745.6, 1455.15, 746.36, 1454.54, 746.66, 1452.4);
        ctx.bezierCurveTo(746.82, 1446.6, 753.23, 1440.8, 763.16, 1440.8);
        ctx.bezierCurveTo(773.4, 1440.8, 779.96, 1449.35, 779.96, 1458.51);
        ctx.bezierCurveTo(779.96, 1473.48, 763.77, 1488.76, 745.44, 1488.76);
        ctx.bezierCurveTo(719.17, 1488.76, 710.01, 1472.57, 710.01, 1459.13);
        ctx.bezierCurveTo(710.01, 1440.03, 732.31, 1422.16, 758.73, 1422.16);
        ctx.lineTo(764.23, 1422.16);
        ctx.bezierCurveTo(766.06, 1422.16, 766.98, 1420.94, 766.98, 1419.72);
        ctx.bezierCurveTo(766.98, 1418.49, 766.06, 1417.12, 764.08, 1417.12);
        ctx.lineTo(761.33, 1417.12);
        ctx.bezierCurveTo(749.11, 1417.12, 744.53, 1408.87, 744.53, 1398.48);
        ctx.bezierCurveTo(744.53, 1382.9, 761.63, 1369.92, 780.42, 1369.92);
        ctx.bezierCurveTo(798.75, 1369.92, 809.6, 1380.46, 809.6, 1390.69);
        ctx.bezierCurveTo(809.6, 1400.16, 801.5, 1408.87, 790.96, 1408.87);
        ctx.bezierCurveTo(781.8, 1408.87, 777.98, 1403.98, 777.98, 1398.64);
        ctx.bezierCurveTo(777.98, 1396.19, 778.89, 1393.75, 779.96, 1392.37);
        ctx.bezierCurveTo(782.1, 1389.78, 778.28, 1387.03, 776.15, 1389.78);
        ctx.bezierCurveTo(774.46, 1391.92, 773.55, 1395.73, 773.55, 1398.64);
        ctx.bezierCurveTo(773.55, 1405.82, 779.05, 1413.3, 790.96, 1413.3);
        ctx.bezierCurveTo(804.1, 1413.3, 814.18, 1401.69, 814.18, 1389.93);
        ctx.bezierCurveTo(814.18, 1377.86, 801.5, 1365.64, 780.73, 1365.64);
        ctx.bezierCurveTo(759.34, 1365.64, 740.1, 1380.92, 740.1, 1399.1);
        ctx.bezierCurveTo(740.1, 1405.51, 742.39, 1414.83, 750.64, 1418.95);
        ctx.bezierCurveTo(749.87, 1418.95, 748.8, 1418.8, 747.73, 1418.8);
        ctx.bezierCurveTo(720.7, 1423.84, 705.58, 1442.78, 705.58, 1459.28);
        ctx.bezierCurveTo(705.58, 1475.16, 716.27, 1493.34, 745.29, 1493.34);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(819.47, 1455);
        ctx.bezierCurveTo(818.09, 1457.9, 817.48, 1460.5, 817.48, 1462.94);
        ctx.bezierCurveTo(817.48, 1469.51, 821.61, 1472.57, 828.33, 1472.57);
        ctx.bezierCurveTo(837.49, 1472.57, 844.21, 1462.33, 846.35, 1456.68);
        ctx.bezierCurveTo(847.42, 1453.93, 843.75, 1452.71, 842.53, 1455);
        ctx.bezierCurveTo(841.31, 1457.6, 836.88, 1468.29, 828.33, 1468.29);
        ctx.bezierCurveTo(824.36, 1468.29, 822.06, 1466.61, 822.06, 1462.94);
        ctx.bezierCurveTo(822.06, 1461.57, 822.68, 1459.28, 823.74, 1456.83);
        ctx.lineTo(834.9, 1432.85);
        ctx.bezierCurveTo(836.27, 1429.95, 836.88, 1427.51, 836.88, 1425.06);
        ctx.bezierCurveTo(836.88, 1418.49, 832.3, 1414.83, 825.27, 1415.29);
        ctx.bezierCurveTo(822.37, 1415.59, 819.77, 1416.81, 817.48, 1418.65);
        ctx.bezierCurveTo(818.09, 1415.9, 814.27, 1414.83, 813.05, 1417.42);
        ctx.lineTo(789.53, 1468.6);
        ctx.bezierCurveTo(787.85, 1472.26, 792.58, 1473.18, 794.26, 1469.66);
        ctx.lineTo(811.83, 1431.32);
        ctx.bezierCurveTo(813.82, 1427.2, 818.4, 1420.17, 825.27, 1419.56);
        ctx.bezierCurveTo(829.4, 1419.26, 832.3, 1421.4, 832.3, 1425.06);
        ctx.bezierCurveTo(832.3, 1426.44, 831.69, 1428.73, 830.62, 1431.02);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(871.04, 1415.29);
        ctx.bezierCurveTo(860.96, 1415.29, 855.46, 1426.44, 853.48, 1430.87);
        ctx.lineTo(845.23, 1448.28);
        ctx.bezierCurveTo(837.59, 1464.32, 845.38, 1472.57, 858.21, 1472.57);
        ctx.bezierCurveTo(868.9, 1472.57, 878.37, 1464.78, 881.89, 1456.68);
        ctx.bezierCurveTo(883.11, 1453.93, 879.29, 1452.71, 878.07, 1455);
        ctx.bezierCurveTo(875.62, 1459.58, 868.29, 1468.29, 858.21, 1468.29);
        ctx.bezierCurveTo(848.13, 1468.29, 844.31, 1461.11, 849.5, 1450.11);
        ctx.lineTo(857.45, 1433.31);
        ctx.bezierCurveTo(859.13, 1429.49, 863.4, 1419.56, 871.04, 1419.56);
        ctx.bezierCurveTo(877.76, 1419.56, 876.39, 1425.37, 874.86, 1429.03);
        ctx.bezierCurveTo(874.25, 1430.41, 873.94, 1431.32, 873.33, 1432.39);
        ctx.bezierCurveTo(871.81, 1436.06, 876.69, 1437.28, 878.37, 1433.16);
        ctx.lineTo(879.75, 1429.8);
        ctx.bezierCurveTo(883.26, 1421.55, 879.75, 1415.29, 871.04, 1415.29);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(898.3, 1455);
        ctx.bezierCurveTo(896.92, 1457.9, 896.31, 1460.5, 896.31, 1462.94);
        ctx.bezierCurveTo(896.31, 1469.51, 900.43, 1472.57, 907.15, 1472.57);
        ctx.bezierCurveTo(916.32, 1472.57, 923.04, 1462.33, 925.18, 1456.68);
        ctx.bezierCurveTo(926.25, 1453.93, 922.58, 1452.71, 921.36, 1455);
        ctx.bezierCurveTo(920.14, 1457.6, 915.71, 1468.29, 907.15, 1468.29);
        ctx.bezierCurveTo(903.18, 1468.29, 900.89, 1466.61, 900.89, 1462.94);
        ctx.bezierCurveTo(900.89, 1461.57, 901.5, 1459.28, 902.57, 1456.83);
        ctx.lineTo(914.03, 1432.24);
        ctx.bezierCurveTo(915.4, 1429.34, 916.01, 1426.9, 916.01, 1424.45);
        ctx.bezierCurveTo(916.01, 1417.88, 912.35, 1414.22, 906.24, 1414.68);
        ctx.bezierCurveTo(903.79, 1414.68, 902.57, 1413.15, 904.71, 1408.41);
        ctx.bezierCurveTo(906.24, 1405.36, 901.81, 1403.83, 900.43, 1406.43);
        ctx.lineTo(899.98, 1407.65);
        ctx.lineTo(878.13, 1455);
        ctx.bezierCurveTo(876.45, 1458.67, 880.58, 1459.58, 881.95, 1456.68);
        ctx.lineTo(900.74, 1416.66);
        ctx.bezierCurveTo(901.96, 1418.19, 903.79, 1418.95, 906.24, 1418.95);
        ctx.bezierCurveTo(909.45, 1418.65, 911.43, 1420.79, 911.43, 1424.45);
        ctx.bezierCurveTo(911.43, 1425.83, 910.82, 1428.12, 909.75, 1430.41);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(942.93, 1419.41);
        ctx.bezierCurveTo(944.3, 1416.2, 939.87, 1414.68, 938.65, 1417.58);
        ctx.lineTo(921.39, 1455);
        ctx.bezierCurveTo(920.02, 1457.9, 919.41, 1460.35, 919.41, 1462.79);
        ctx.bezierCurveTo(919.41, 1469.36, 924.14, 1472.57, 931.01, 1472.57);
        ctx.bezierCurveTo(936.36, 1472.57, 940.48, 1469.21, 943.39, 1465.54);
        ctx.bezierCurveTo(944.46, 1470.28, 948.27, 1472.57, 954.08, 1472.57);
        ctx.bezierCurveTo(963.24, 1472.57, 969.96, 1462.33, 972.1, 1456.68);
        ctx.bezierCurveTo(973.17, 1453.93, 969.51, 1452.71, 968.28, 1455);
        ctx.bezierCurveTo(967.06, 1457.6, 962.63, 1468.29, 954.08, 1468.29);
        ctx.bezierCurveTo(950.11, 1468.29, 947.82, 1466.61, 947.82, 1462.94);
        ctx.bezierCurveTo(947.82, 1461.57, 948.43, 1459.28, 949.5, 1456.83);
        ctx.lineTo(966.6, 1419.41);
        ctx.bezierCurveTo(967.98, 1416.2, 963.55, 1414.68, 962.33, 1417.58);
        ctx.lineTo(945.22, 1455);
        ctx.lineTo(944.46, 1456.53);
        ctx.bezierCurveTo(942.47, 1460.65, 937.89, 1468.29, 931.01, 1468.29);
        ctx.bezierCurveTo(926.89, 1468.29, 923.99, 1466.46, 923.99, 1462.79);
        ctx.bezierCurveTo(923.99, 1461.42, 924.6, 1459.12, 925.67, 1456.83);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(965.63, 1471.65);
        ctx.bezierCurveTo(967.62, 1472.41, 969.91, 1472.87, 972.35, 1472.87);
        ctx.bezierCurveTo(985.18, 1472.87, 995.27, 1461.11, 996.33, 1448.89);
        ctx.bezierCurveTo(996.95, 1439.12, 990.07, 1429.8, 990.84, 1419.72);
        ctx.bezierCurveTo(990.99, 1417.73, 991.6, 1415.59, 992.52, 1413.45);
        ctx.lineTo(993.28, 1411.77);
        ctx.bezierCurveTo(994.81, 1408.57, 990.22, 1407.04, 989, 1409.94);
        ctx.lineTo(968.23, 1455);
        ctx.bezierCurveTo(966.85, 1457.9, 970.52, 1460.04, 972.05, 1456.68);
        ctx.lineTo(986.41, 1426.28);
        ctx.bezierCurveTo(987.78, 1434.38, 992.36, 1441.25, 991.75, 1449.04);
        ctx.bezierCurveTo(990.99, 1459.74, 982.89, 1468.29, 972.81, 1468.29);
        ctx.bezierCurveTo(971.28, 1468.29, 969.76, 1468.14, 968.38, 1467.68);
        ctx.bezierCurveTo(966.4, 1467.07, 964.87, 1466, 963.8, 1464.78);
        ctx.bezierCurveTo(961.36, 1462.64, 958.61, 1466, 960.29, 1467.83);
        ctx.bezierCurveTo(961.66, 1469.36, 963.49, 1470.73, 965.63, 1471.65);
        ctx.closePath();
        ctx.moveTo(992.82, 1472.57);
        ctx.bezierCurveTo(1001.99, 1472.57, 1008.71, 1462.33, 1010.85, 1456.68);
        ctx.bezierCurveTo(1011.92, 1453.93, 1008.25, 1452.71, 1007.03, 1455);
        ctx.bezierCurveTo(1005.81, 1457.6, 1001.38, 1468.29, 992.82, 1468.29);
        ctx.bezierCurveTo(990.53, 1468.29, 990.53, 1472.57, 992.82, 1472.57);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1036.34, 1420.33);
        ctx.bezierCurveTo(1039.24, 1420.33, 1040.62, 1416.05, 1037.72, 1416.05);
        ctx.lineTo(1029.92, 1416.05);
        ctx.lineTo(1036.49, 1401.69);
        ctx.bezierCurveTo(1037.87, 1398.48, 1033.44, 1396.96, 1032.22, 1399.86);
        ctx.lineTo(1024.73, 1416.05);
        ctx.lineTo(1019.84, 1416.05);
        ctx.bezierCurveTo(1016.64, 1416.05, 1015.41, 1420.33, 1018.47, 1420.33);
        ctx.lineTo(1022.9, 1420.33);
        ctx.lineTo(1007.01, 1455);
        ctx.bezierCurveTo(1005.64, 1457.9, 1005.03, 1460.5, 1005.03, 1462.94);
        ctx.bezierCurveTo(1005.03, 1469.51, 1009.76, 1472.57, 1017.09, 1472.57);
        ctx.bezierCurveTo(1026.26, 1472.57, 1032.98, 1462.33, 1035.12, 1456.68);
        ctx.bezierCurveTo(1036.19, 1453.93, 1032.52, 1452.71, 1031.3, 1455);
        ctx.bezierCurveTo(1030.08, 1457.6, 1025.65, 1468.29, 1017.09, 1468.29);
        ctx.bezierCurveTo(1012.51, 1468.29, 1009.61, 1466.61, 1009.61, 1462.94);
        ctx.bezierCurveTo(1009.61, 1461.57, 1010.22, 1459.28, 1011.29, 1456.83);
        ctx.lineTo(1027.94, 1420.33);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1059.59, 1415.29);
        ctx.bezierCurveTo(1049.51, 1415.29, 1044.01, 1426.44, 1042.02, 1430.87);
        ctx.lineTo(1033.77, 1448.28);
        ctx.bezierCurveTo(1026.14, 1464.32, 1033.93, 1472.57, 1046.76, 1472.57);
        ctx.bezierCurveTo(1057.45, 1472.57, 1066.92, 1464.78, 1070.43, 1456.68);
        ctx.bezierCurveTo(1071.66, 1453.93, 1067.84, 1452.71, 1066.62, 1455);
        ctx.bezierCurveTo(1064.17, 1459.58, 1056.84, 1468.29, 1046.76, 1468.29);
        ctx.bezierCurveTo(1036.68, 1468.29, 1032.86, 1461.11, 1038.05, 1450.11);
        ctx.lineTo(1040.8, 1444.16);
        ctx.bezierCurveTo(1042.63, 1445.84, 1045.69, 1446.75, 1048.59, 1446.75);
        ctx.bezierCurveTo(1057.6, 1446.75, 1063.56, 1441.56, 1068.3, 1429.8);
        ctx.bezierCurveTo(1071.66, 1421.55, 1068.3, 1415.29, 1059.59, 1415.29);
        ctx.closePath();
        ctx.moveTo(1063.41, 1429.03);
        ctx.bezierCurveTo(1059.89, 1437.59, 1055.62, 1442.02, 1048.44, 1442.02);
        ctx.bezierCurveTo(1046.45, 1442.02, 1043.7, 1440.95, 1042.79, 1440.18);
        ctx.lineTo(1045.99, 1433.31);
        ctx.bezierCurveTo(1047.67, 1429.49, 1051.95, 1419.56, 1059.59, 1419.56);
        ctx.bezierCurveTo(1066.31, 1419.56, 1064.93, 1425.37, 1063.41, 1429.03);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1099.37, 1472.57);
        ctx.bezierCurveTo(1108.53, 1472.57, 1115.25, 1462.33, 1117.39, 1456.68);
        ctx.bezierCurveTo(1118.46, 1453.93, 1114.8, 1452.71, 1113.57, 1455);
        ctx.bezierCurveTo(1112.35, 1457.6, 1107.92, 1468.29, 1099.37, 1468.29);
        ctx.bezierCurveTo(1095.4, 1468.29, 1093.1, 1466.61, 1093.1, 1462.94);
        ctx.bezierCurveTo(1093.1, 1461.57, 1093.72, 1459.28, 1094.79, 1456.83);
        ctx.lineTo(1127.63, 1385.2);
        ctx.bezierCurveTo(1129, 1381.99, 1124.57, 1380.46, 1123.35, 1383.36);
        ctx.lineTo(1106.09, 1420.79);
        ctx.bezierCurveTo(1104.56, 1417.27, 1100.74, 1415.29, 1096.16, 1415.29);
        ctx.bezierCurveTo(1085.77, 1415.29, 1079.97, 1426.44, 1077.98, 1430.87);
        ctx.lineTo(1066.68, 1455);
        ctx.bezierCurveTo(1065.31, 1457.9, 1064.69, 1460.35, 1064.69, 1462.79);
        ctx.bezierCurveTo(1064.69, 1469.36, 1069.43, 1472.57, 1076.3, 1472.57);
        ctx.bezierCurveTo(1081.65, 1472.57, 1085.77, 1469.21, 1088.68, 1465.54);
        ctx.bezierCurveTo(1089.74, 1470.28, 1093.56, 1472.57, 1099.37, 1472.57);
        ctx.closePath();
        ctx.moveTo(1090.51, 1455);
        ctx.lineTo(1089.74, 1456.53);
        ctx.bezierCurveTo(1087.76, 1460.65, 1083.18, 1468.29, 1076.3, 1468.29);
        ctx.bezierCurveTo(1072.18, 1468.29, 1069.28, 1466.46, 1069.28, 1462.79);
        ctx.bezierCurveTo(1069.28, 1461.42, 1069.89, 1459.13, 1070.96, 1456.83);
        ctx.lineTo(1081.95, 1433.31);
        ctx.bezierCurveTo(1083.63, 1429.49, 1088.22, 1419.56, 1096.16, 1419.56);
        ctx.bezierCurveTo(1100.28, 1419.56, 1103.19, 1421.4, 1103.19, 1425.06);
        ctx.bezierCurveTo(1103.19, 1426.59, 1102.58, 1428.58, 1101.51, 1431.02);
        ctx.closePath();
        ctx.fill();

        // ca
        ctx.beginPath();
        ctx.moveTo(844.05, 1772);
        ctx.bezierCurveTo(844.05, 1772.48, 844.49, 1772.89, 845.02, 1772.89);
        ctx.bezierCurveTo(845.5, 1772.89, 845.82, 1772.6, 846.03, 1772.12);
        ctx.lineTo(849.33, 1764.83);
        ctx.lineTo(865.96, 1764.83);
        ctx.lineTo(869.26, 1772.08);
        ctx.bezierCurveTo(869.46, 1772.52, 869.82, 1772.89, 870.31, 1772.89);
        ctx.bezierCurveTo(870.87, 1772.89, 871.31, 1772.44, 871.31, 1771.92);
        ctx.bezierCurveTo(871.31, 1771.72, 871.27, 1771.52, 871.15, 1771.28);
        ctx.lineTo(859.15, 1745.26);
        ctx.bezierCurveTo(858.87, 1744.66, 858.47, 1744.26, 857.74, 1744.26);
        ctx.lineTo(857.66, 1744.26);
        ctx.bezierCurveTo(856.94, 1744.26, 856.53, 1744.66, 856.25, 1745.26);
        ctx.lineTo(844.21, 1771.36);
        ctx.bezierCurveTo(844.09, 1771.6, 844.05, 1771.84, 844.05, 1772);
        ctx.closePath();
        ctx.moveTo(850.21, 1762.94);
        ctx.lineTo(857.66, 1746.63);
        ctx.lineTo(865.07, 1762.94);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(914.67, 1773.21);
        ctx.bezierCurveTo(919.39, 1773.21, 922.49, 1771.48, 925.35, 1768.82);
        ctx.bezierCurveTo(925.51, 1768.66, 925.67, 1768.42, 925.67, 1768.1);
        ctx.bezierCurveTo(925.67, 1767.57, 925.18, 1767.09, 924.66, 1767.09);
        ctx.bezierCurveTo(924.34, 1767.09, 924.1, 1767.25, 923.94, 1767.41);
        ctx.bezierCurveTo(921.28, 1769.95, 918.58, 1771.32, 914.75, 1771.32);
        ctx.bezierCurveTo(908.03, 1771.32, 902.84, 1765.76, 902.84, 1758.63);
        ctx.lineTo(902.84, 1758.55);
        ctx.bezierCurveTo(902.84, 1751.46, 907.95, 1745.95, 914.71, 1745.95);
        ctx.bezierCurveTo(918.66, 1745.95, 921.36, 1747.48, 923.69, 1749.61);
        ctx.bezierCurveTo(923.86, 1749.77, 924.14, 1749.89, 924.42, 1749.89);
        ctx.bezierCurveTo(924.98, 1749.89, 925.51, 1749.41, 925.51, 1748.85);
        ctx.bezierCurveTo(925.51, 1748.48, 925.3, 1748.2, 925.1, 1748);
        ctx.bezierCurveTo(922.37, 1745.67, 919.43, 1744.05, 914.75, 1744.05);
        ctx.bezierCurveTo(906.62, 1744.05, 900.66, 1750.66, 900.66, 1758.63);
        ctx.lineTo(900.66, 1758.71);
        ctx.bezierCurveTo(900.66, 1766.81, 906.62, 1773.21, 914.67, 1773.21);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(937.66, 1771.84);
        ctx.bezierCurveTo(937.66, 1772.4, 938.14, 1772.89, 938.71, 1772.89);
        ctx.bezierCurveTo(939.27, 1772.89, 939.75, 1772.4, 939.75, 1771.84);
        ctx.lineTo(939.75, 1761.05);
        ctx.lineTo(948.97, 1761.05);
        ctx.lineTo(957.63, 1772.32);
        ctx.bezierCurveTo(957.87, 1772.65, 958.15, 1772.89, 958.56, 1772.89);
        ctx.bezierCurveTo(959.12, 1772.89, 959.64, 1772.36, 959.64, 1771.8);
        ctx.bezierCurveTo(959.64, 1771.56, 959.52, 1771.32, 959.32, 1771.07);
        ctx.lineTo(951.31, 1760.69);
        ctx.bezierCurveTo(956.06, 1760.04, 959.56, 1757.34, 959.56, 1752.63);
        ctx.lineTo(959.56, 1752.55);
        ctx.bezierCurveTo(959.56, 1750.54, 958.76, 1748.65, 957.43, 1747.32);
        ctx.bezierCurveTo(955.74, 1745.63, 952.96, 1744.54, 949.5, 1744.54);
        ctx.lineTo(938.71, 1744.54);
        ctx.bezierCurveTo(938.14, 1744.54, 937.66, 1745.02, 937.66, 1745.59);
        ctx.closePath();
        ctx.moveTo(939.75, 1759.16);
        ctx.lineTo(939.75, 1746.47);
        ctx.lineTo(949.38, 1746.47);
        ctx.bezierCurveTo(954.49, 1746.47, 957.47, 1748.85, 957.47, 1752.63);
        ctx.lineTo(957.47, 1752.71);
        ctx.bezierCurveTo(957.47, 1756.78, 953.97, 1759.16, 949.26, 1759.16);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(983.89, 1773.17);
        ctx.bezierCurveTo(990.74, 1773.17, 995.45, 1768.86, 995.45, 1760.77);
        ctx.lineTo(995.45, 1745.42);
        ctx.bezierCurveTo(995.45, 1744.86, 994.97, 1744.38, 994.4, 1744.38);
        ctx.bezierCurveTo(993.84, 1744.38, 993.35, 1744.86, 993.35, 1745.42);
        ctx.lineTo(993.35, 1761.01);
        ctx.bezierCurveTo(993.35, 1767.81, 989.69, 1771.28, 983.97, 1771.28);
        ctx.bezierCurveTo(978.01, 1771.28, 974.43, 1767.45, 974.43, 1760.81);
        ctx.lineTo(974.43, 1745.42);
        ctx.bezierCurveTo(974.43, 1744.86, 973.95, 1744.38, 973.38, 1744.38);
        ctx.bezierCurveTo(972.82, 1744.38, 972.33, 1744.86, 972.33, 1745.42);
        ctx.lineTo(972.33, 1761.01);
        ctx.bezierCurveTo(972.33, 1768.9, 977.13, 1773.17, 983.89, 1773.17);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1018.93, 1773.13);
        ctx.bezierCurveTo(1024.37, 1773.13, 1028.28, 1769.99, 1028.28, 1765.44);
        ctx.lineTo(1028.28, 1765.36);
        ctx.bezierCurveTo(1028.28, 1761.25, 1025.54, 1758.91, 1019.02, 1757.58);
        ctx.bezierCurveTo(1012.33, 1756.22, 1010.8, 1754.4, 1010.8, 1751.42);
        ctx.lineTo(1010.8, 1751.34);
        ctx.bezierCurveTo(1010.8, 1748.4, 1013.54, 1746.03, 1017.69, 1746.03);
        ctx.bezierCurveTo(1020.55, 1746.03, 1023, 1746.79, 1025.46, 1748.69);
        ctx.bezierCurveTo(1025.66, 1748.85, 1025.9, 1748.93, 1026.14, 1748.93);
        ctx.bezierCurveTo(1026.71, 1748.93, 1027.19, 1748.44, 1027.19, 1747.88);
        ctx.bezierCurveTo(1027.19, 1747.48, 1026.95, 1747.2, 1026.75, 1747.03);
        ctx.bezierCurveTo(1024.17, 1745.1, 1021.55, 1744.13, 1017.77, 1744.13);
        ctx.bezierCurveTo(1012.53, 1744.13, 1008.71, 1747.36, 1008.71, 1751.54);
        ctx.lineTo(1008.71, 1751.63);
        ctx.bezierCurveTo(1008.71, 1755.89, 1011.45, 1758.19, 1018.21, 1759.56);
        ctx.bezierCurveTo(1024.61, 1760.85, 1026.18, 1762.58, 1026.18, 1765.56);
        ctx.lineTo(1026.18, 1765.64);
        ctx.bezierCurveTo(1026.18, 1768.86, 1023.28, 1771.24, 1019.06, 1771.24);
        ctx.bezierCurveTo(1015.19, 1771.24, 1012.37, 1770.11, 1009.55, 1767.57);
        ctx.bezierCurveTo(1009.39, 1767.45, 1009.15, 1767.33, 1008.87, 1767.33);
        ctx.bezierCurveTo(1008.3, 1767.33, 1007.82, 1767.81, 1007.82, 1768.38);
        ctx.bezierCurveTo(1007.82, 1768.74, 1008.02, 1769.02, 1008.22, 1769.18);
        ctx.bezierCurveTo(1011.4, 1771.8, 1014.71, 1773.13, 1018.93, 1773.13);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1048.39, 1771.84);
        ctx.bezierCurveTo(1048.39, 1772.4, 1048.87, 1772.89, 1049.44, 1772.89);
        ctx.bezierCurveTo(1050, 1772.89, 1050.48, 1772.4, 1050.48, 1771.84);
        ctx.lineTo(1050.48, 1746.47);
        ctx.lineTo(1059.5, 1746.47);
        ctx.bezierCurveTo(1060.03, 1746.47, 1060.47, 1746.03, 1060.47, 1745.51);
        ctx.bezierCurveTo(1060.47, 1744.98, 1060.03, 1744.54, 1059.5, 1744.54);
        ctx.lineTo(1039.37, 1744.54);
        ctx.bezierCurveTo(1038.85, 1744.54, 1038.4, 1744.98, 1038.4, 1745.51);
        ctx.bezierCurveTo(1038.4, 1746.03, 1038.85, 1746.47, 1039.37, 1746.47);
        ctx.lineTo(1048.39, 1746.47);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1088.91, 1772);
        ctx.bezierCurveTo(1088.91, 1772.48, 1089.35, 1772.89, 1089.87, 1772.89);
        ctx.bezierCurveTo(1090.36, 1772.89, 1090.68, 1772.6, 1090.88, 1772.12);
        ctx.lineTo(1094.18, 1764.83);
        ctx.lineTo(1110.81, 1764.83);
        ctx.lineTo(1114.12, 1772.08);
        ctx.bezierCurveTo(1114.32, 1772.52, 1114.68, 1772.89, 1115.16, 1772.89);
        ctx.bezierCurveTo(1115.73, 1772.89, 1116.17, 1772.44, 1116.17, 1771.92);
        ctx.bezierCurveTo(1116.17, 1771.72, 1116.13, 1771.52, 1116.01, 1771.28);
        ctx.lineTo(1104.01, 1745.26);
        ctx.bezierCurveTo(1103.73, 1744.66, 1103.32, 1744.26, 1102.6, 1744.26);
        ctx.lineTo(1102.52, 1744.26);
        ctx.bezierCurveTo(1101.79, 1744.26, 1101.39, 1744.66, 1101.11, 1745.26);
        ctx.lineTo(1089.07, 1771.36);
        ctx.bezierCurveTo(1088.95, 1771.6, 1088.91, 1771.84, 1088.91, 1772);
        ctx.closePath();
        ctx.moveTo(1095.07, 1762.94);
        ctx.lineTo(1102.52, 1746.63);
        ctx.lineTo(1109.93, 1762.94);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1128.63, 1771.68);
        ctx.bezierCurveTo(1128.63, 1772.24, 1129.12, 1772.73, 1129.68, 1772.73);
        ctx.lineTo(1140.88, 1772.73);
        ctx.bezierCurveTo(1146.96, 1772.73, 1150.98, 1769.75, 1150.98, 1765.03);
        ctx.lineTo(1150.98, 1764.95);
        ctx.bezierCurveTo(1150.98, 1761.05, 1148, 1759.11, 1144.62, 1758.23);
        ctx.bezierCurveTo(1146.92, 1757.3, 1149.41, 1755.37, 1149.41, 1751.54);
        ctx.lineTo(1149.41, 1751.46);
        ctx.bezierCurveTo(1149.41, 1749.69, 1148.77, 1748.2, 1147.6, 1747.03);
        ctx.bezierCurveTo(1146.03, 1745.46, 1143.45, 1744.54, 1140.27, 1744.54);
        ctx.lineTo(1129.68, 1744.54);
        ctx.bezierCurveTo(1129.12, 1744.54, 1128.63, 1745.02, 1128.63, 1745.58);
        ctx.closePath();
        ctx.moveTo(1130.73, 1757.54);
        ctx.lineTo(1130.73, 1746.47);
        ctx.lineTo(1140.23, 1746.47);
        ctx.bezierCurveTo(1144.74, 1746.47, 1147.28, 1748.57, 1147.28, 1751.67);
        ctx.lineTo(1147.28, 1751.75);
        ctx.bezierCurveTo(1147.28, 1755.49, 1144.26, 1757.55, 1140.03, 1757.55);
        ctx.closePath();
        ctx.moveTo(1130.73, 1770.79);
        ctx.lineTo(1130.73, 1759.48);
        ctx.lineTo(1140.27, 1759.48);
        ctx.bezierCurveTo(1145.83, 1759.48, 1148.85, 1761.49, 1148.85, 1764.95);
        ctx.lineTo(1148.85, 1765.04);
        ctx.bezierCurveTo(1148.85, 1768.58, 1145.79, 1770.79, 1140.96, 1770.79);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1176.64, 1773.21);
        ctx.bezierCurveTo(1185.18, 1773.21, 1190.85, 1766.32, 1190.85, 1758.63);
        ctx.lineTo(1190.85, 1758.55);
        ctx.bezierCurveTo(1190.85, 1750.86, 1185.26, 1744.06, 1176.72, 1744.06);
        ctx.bezierCurveTo(1168.18, 1744.06, 1162.51, 1750.94, 1162.51, 1758.63);
        ctx.lineTo(1162.51, 1758.71);
        ctx.bezierCurveTo(1162.51, 1766.4, 1168.1, 1773.21, 1176.64, 1773.21);
        ctx.closePath();
        ctx.moveTo(1176.72, 1771.32);
        ctx.bezierCurveTo(1169.75, 1771.32, 1164.68, 1765.6, 1164.68, 1758.63);
        ctx.lineTo(1164.68, 1758.55);
        ctx.bezierCurveTo(1164.68, 1751.59, 1169.67, 1745.95, 1176.64, 1745.95);
        ctx.bezierCurveTo(1183.61, 1745.95, 1188.68, 1751.67, 1188.68, 1758.63);
        ctx.lineTo(1188.68, 1758.71);
        ctx.bezierCurveTo(1188.68, 1765.68, 1183.69, 1771.32, 1176.72, 1771.32);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1213.28, 1773.01);
        ctx.lineTo(1213.37, 1773.01);
        ctx.bezierCurveTo(1214.01, 1773.01, 1214.37, 1772.65, 1214.61, 1772.08);
        ctx.lineTo(1226.13, 1745.75);
        ctx.bezierCurveTo(1226.21, 1745.59, 1226.21, 1745.51, 1226.21, 1745.34);
        ctx.bezierCurveTo(1226.21, 1744.86, 1225.77, 1744.38, 1225.2, 1744.38);
        ctx.bezierCurveTo(1224.72, 1744.38, 1224.36, 1744.74, 1224.16, 1745.18);
        ctx.lineTo(1213.37, 1770.47);
        ctx.lineTo(1202.61, 1745.22);
        ctx.bezierCurveTo(1202.41, 1744.74, 1202.05, 1744.38, 1201.53, 1744.38);
        ctx.bezierCurveTo(1200.92, 1744.38, 1200.48, 1744.9, 1200.48, 1745.38);
        ctx.bezierCurveTo(1200.48, 1745.59, 1200.48, 1745.67, 1200.56, 1745.83);
        ctx.lineTo(1212.04, 1772.08);
        ctx.bezierCurveTo(1212.28, 1772.65, 1212.64, 1773.01, 1213.29, 1773.01);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1239.68, 1772.73);
        ctx.lineTo(1258.08, 1772.73);
        ctx.bezierCurveTo(1258.61, 1772.73, 1259.05, 1772.28, 1259.05, 1771.76);
        ctx.bezierCurveTo(1259.05, 1771.24, 1258.61, 1770.79, 1258.08, 1770.79);
        ctx.lineTo(1240.73, 1770.79);
        ctx.lineTo(1240.73, 1759.48);
        ctx.lineTo(1256.07, 1759.48);
        ctx.bezierCurveTo(1256.59, 1759.48, 1257.03, 1759.03, 1257.03, 1758.51);
        ctx.bezierCurveTo(1257.03, 1757.99, 1256.59, 1757.54, 1256.07, 1757.54);
        ctx.lineTo(1240.73, 1757.54);
        ctx.lineTo(1240.73, 1746.47);
        ctx.lineTo(1257.88, 1746.47);
        ctx.bezierCurveTo(1258.4, 1746.47, 1258.85, 1746.03, 1258.85, 1745.51);
        ctx.bezierCurveTo(1258.85, 1744.98, 1258.4, 1744.54, 1257.88, 1744.54);
        ctx.lineTo(1239.68, 1744.54);
        ctx.bezierCurveTo(1239.12, 1744.54, 1238.63, 1745.02, 1238.63, 1745.59);
        ctx.lineTo(1238.63, 1771.68);
        ctx.bezierCurveTo(1238.63, 1772.24, 1239.12, 1772.73, 1239.68, 1772.73);
        ctx.closePath();
        ctx.fill();

        // c
        ctx.beginPath();
        ctx.moveTo(1176.83, 1474.16);
        ctx.bezierCurveTo(1200.36, 1474.16, 1216.55, 1455.07, 1216.55, 1438.57);
        ctx.bezierCurveTo(1216.55, 1427.27, 1208.61, 1417.34, 1195.93, 1417.34);
        ctx.bezierCurveTo(1184.01, 1417.34, 1176.99, 1424.37, 1174.54, 1431.09);
        ctx.bezierCurveTo(1173.17, 1434.75, 1177.45, 1436.43, 1178.82, 1432.92);
        ctx.bezierCurveTo(1180.65, 1428.19, 1185.08, 1421.62, 1195.93, 1421.62);
        ctx.bezierCurveTo(1205.7, 1421.62, 1211.97, 1430.02, 1211.97, 1439.18);
        ctx.bezierCurveTo(1211.97, 1453.69, 1197.46, 1469.73, 1176.83, 1469.73);
        ctx.bezierCurveTo(1151.33, 1469.73, 1137.27, 1447.74, 1137.27, 1425.28);
        ctx.bezierCurveTo(1137.27, 1397.02, 1165.38, 1358.99, 1204.18, 1358.99);
        ctx.bezierCurveTo(1223.88, 1358.99, 1232.74, 1369.99, 1232.74, 1380.22);
        ctx.bezierCurveTo(1232.74, 1389.08, 1224.64, 1397.94, 1214.56, 1397.94);
        ctx.bezierCurveTo(1204.79, 1397.94, 1201.43, 1392.6, 1201.43, 1387.4);
        ctx.bezierCurveTo(1201.43, 1385.57, 1202.19, 1383.43, 1202.95, 1382.06);
        ctx.bezierCurveTo(1204.48, 1379.46, 1201.12, 1377.32, 1199.14, 1379.76);
        ctx.bezierCurveTo(1197.46, 1381.9, 1196.84, 1384.65, 1196.84, 1387.25);
        ctx.bezierCurveTo(1196.84, 1394.58, 1200.97, 1402.37, 1214.11, 1402.37);
        ctx.bezierCurveTo(1227.24, 1402.37, 1237.17, 1390.76, 1237.17, 1379.31);
        ctx.bezierCurveTo(1237.17, 1367.24, 1225.87, 1354.56, 1204.48, 1354.56);
        ctx.bezierCurveTo(1162.17, 1354.56, 1132.69, 1395.65, 1132.69, 1425.44);
        ctx.bezierCurveTo(1132.69, 1451.4, 1149.8, 1474.16, 1176.83, 1474.16);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1248.89, 1438.57);
        ctx.bezierCurveTo(1247.52, 1441.47, 1246.91, 1444.07, 1246.91, 1446.51);
        ctx.bezierCurveTo(1246.91, 1453.08, 1251.03, 1456.14, 1257.75, 1456.14);
        ctx.bezierCurveTo(1266.92, 1456.14, 1273.64, 1445.9, 1275.78, 1440.25);
        ctx.bezierCurveTo(1276.85, 1437.5, 1273.18, 1436.28, 1271.96, 1438.57);
        ctx.bezierCurveTo(1270.74, 1441.17, 1266.31, 1451.86, 1257.75, 1451.86);
        ctx.bezierCurveTo(1253.78, 1451.86, 1251.49, 1450.18, 1251.49, 1446.51);
        ctx.bezierCurveTo(1251.49, 1445.14, 1252.1, 1442.85, 1253.17, 1440.4);
        ctx.lineTo(1264.63, 1415.81);
        ctx.bezierCurveTo(1266, 1412.91, 1266.61, 1410.47, 1266.61, 1408.02);
        ctx.bezierCurveTo(1266.61, 1401.45, 1262.95, 1397.79, 1256.84, 1398.25);
        ctx.bezierCurveTo(1254.39, 1398.25, 1253.17, 1396.72, 1255.31, 1391.98);
        ctx.bezierCurveTo(1256.84, 1388.93, 1252.41, 1387.4, 1251.03, 1390);
        ctx.lineTo(1250.57, 1391.22);
        ctx.lineTo(1228.73, 1438.57);
        ctx.bezierCurveTo(1227.36, 1441.47, 1224.15, 1448.96, 1224.15, 1456.29);
        ctx.bezierCurveTo(1224.15, 1464.39, 1227.66, 1472.02, 1234.99, 1472.02);
        ctx.bezierCurveTo(1238.51, 1472.02, 1238.51, 1467.44, 1234.99, 1467.44);
        ctx.bezierCurveTo(1231.02, 1467.44, 1228.73, 1461.94, 1228.73, 1456.29);
        ctx.bezierCurveTo(1228.73, 1450.03, 1229.95, 1445.6, 1232.55, 1440.25);
        ctx.lineTo(1251.34, 1400.23);
        ctx.bezierCurveTo(1252.56, 1401.76, 1254.39, 1402.52, 1256.84, 1402.52);
        ctx.bezierCurveTo(1260.04, 1402.22, 1262.03, 1404.36, 1262.03, 1408.02);
        ctx.bezierCurveTo(1262.03, 1409.4, 1261.42, 1411.69, 1260.35, 1413.98);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1293.53, 1402.98);
        ctx.bezierCurveTo(1294.9, 1399.77, 1290.47, 1398.25, 1289.25, 1401.15);
        ctx.lineTo(1271.99, 1438.57);
        ctx.bezierCurveTo(1270.61, 1441.47, 1270, 1443.92, 1270, 1446.36);
        ctx.bezierCurveTo(1270, 1452.93, 1274.74, 1456.14, 1281.61, 1456.14);
        ctx.bezierCurveTo(1286.96, 1456.14, 1291.08, 1452.78, 1293.98, 1449.11);
        ctx.bezierCurveTo(1295.05, 1453.85, 1298.87, 1456.14, 1304.68, 1456.14);
        ctx.bezierCurveTo(1313.84, 1456.14, 1320.56, 1445.9, 1322.7, 1440.25);
        ctx.bezierCurveTo(1323.77, 1437.5, 1320.1, 1436.28, 1318.88, 1438.57);
        ctx.bezierCurveTo(1317.66, 1441.17, 1313.23, 1451.86, 1304.68, 1451.86);
        ctx.bezierCurveTo(1300.71, 1451.86, 1298.41, 1450.18, 1298.41, 1446.51);
        ctx.bezierCurveTo(1298.41, 1445.14, 1299.03, 1442.85, 1300.09, 1440.4);
        ctx.lineTo(1317.2, 1402.98);
        ctx.bezierCurveTo(1318.58, 1399.77, 1314.15, 1398.25, 1312.93, 1401.15);
        ctx.lineTo(1295.82, 1438.57);
        ctx.lineTo(1295.05, 1440.1);
        ctx.bezierCurveTo(1293.07, 1444.22, 1288.49, 1451.86, 1281.61, 1451.86);
        ctx.bezierCurveTo(1277.49, 1451.86, 1274.59, 1450.03, 1274.59, 1446.36);
        ctx.bezierCurveTo(1274.59, 1444.99, 1275.2, 1442.7, 1276.27, 1440.4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1316.23, 1455.22);
        ctx.bezierCurveTo(1318.22, 1455.99, 1320.51, 1456.44, 1322.95, 1456.44);
        ctx.bezierCurveTo(1335.78, 1456.44, 1345.86, 1444.68, 1346.93, 1432.46);
        ctx.bezierCurveTo(1347.54, 1422.69, 1340.67, 1413.37, 1341.43, 1403.29);
        ctx.bezierCurveTo(1341.59, 1401.3, 1342.2, 1399.16, 1343.11, 1397.02);
        ctx.lineTo(1343.88, 1395.34);
        ctx.bezierCurveTo(1345.41, 1392.14, 1340.82, 1390.61, 1339.6, 1393.51);
        ctx.lineTo(1318.83, 1438.57);
        ctx.bezierCurveTo(1317.45, 1441.47, 1321.12, 1443.61, 1322.65, 1440.25);
        ctx.lineTo(1337, 1409.86);
        ctx.bezierCurveTo(1338.38, 1417.95, 1342.96, 1424.82, 1342.35, 1432.61);
        ctx.bezierCurveTo(1341.59, 1443.31, 1333.49, 1451.86, 1323.41, 1451.86);
        ctx.bezierCurveTo(1321.88, 1451.86, 1320.36, 1451.71, 1318.98, 1451.25);
        ctx.bezierCurveTo(1316.99, 1450.64, 1315.47, 1449.57, 1314.4, 1448.35);
        ctx.bezierCurveTo(1311.95, 1446.21, 1309.2, 1449.57, 1310.88, 1451.4);
        ctx.bezierCurveTo(1312.26, 1452.93, 1314.09, 1454.3, 1316.23, 1455.22);
        ctx.closePath();
        ctx.moveTo(1343.42, 1456.14);
        ctx.bezierCurveTo(1352.58, 1456.14, 1359.31, 1445.9, 1361.44, 1440.25);
        ctx.bezierCurveTo(1362.51, 1437.5, 1358.85, 1436.28, 1357.63, 1438.57);
        ctx.bezierCurveTo(1356.4, 1441.17, 1351.97, 1451.86, 1343.42, 1451.86);
        ctx.bezierCurveTo(1341.13, 1451.86, 1341.13, 1456.14, 1343.42, 1456.14);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1386.94, 1403.9);
        ctx.bezierCurveTo(1389.84, 1403.9, 1391.22, 1399.62, 1388.31, 1399.62);
        ctx.lineTo(1380.52, 1399.62);
        ctx.lineTo(1387.09, 1385.26);
        ctx.bezierCurveTo(1388.47, 1382.06, 1384.04, 1380.53, 1382.81, 1383.43);
        ctx.lineTo(1375.33, 1399.62);
        ctx.lineTo(1370.44, 1399.62);
        ctx.bezierCurveTo(1367.23, 1399.62, 1366.01, 1403.9, 1369.07, 1403.9);
        ctx.lineTo(1373.5, 1403.9);
        ctx.lineTo(1357.61, 1438.57);
        ctx.bezierCurveTo(1356.24, 1441.47, 1355.63, 1444.07, 1355.63, 1446.51);
        ctx.bezierCurveTo(1355.63, 1453.08, 1360.36, 1456.14, 1367.69, 1456.14);
        ctx.bezierCurveTo(1376.86, 1456.14, 1383.58, 1445.9, 1385.72, 1440.25);
        ctx.bezierCurveTo(1386.79, 1437.5, 1383.12, 1436.28, 1381.9, 1438.57);
        ctx.bezierCurveTo(1380.68, 1441.17, 1376.25, 1451.86, 1367.69, 1451.86);
        ctx.bezierCurveTo(1363.11, 1451.86, 1360.21, 1450.18, 1360.21, 1446.51);
        ctx.bezierCurveTo(1360.21, 1445.14, 1360.82, 1442.85, 1361.89, 1440.4);
        ctx.lineTo(1378.54, 1403.9);
        ctx.closePath();
        ctx.fill();

        // t
        ctx.beginPath();
        ctx.moveTo(999.41, 1370.11);
        ctx.bezierCurveTo(999.41, 1370.84, 1000.03, 1371.47, 1000.76, 1371.47);
        ctx.bezierCurveTo(1001.49, 1371.47, 1002.12, 1370.84, 1002.12, 1370.11);
        ctx.lineTo(1002.12, 1337.3);
        ctx.lineTo(1013.78, 1337.3);
        ctx.bezierCurveTo(1014.46, 1337.3, 1015.03, 1336.73, 1015.03, 1336.05);
        ctx.bezierCurveTo(1015.03, 1335.38, 1014.46, 1334.81, 1013.78, 1334.81);
        ctx.lineTo(987.74, 1334.81);
        ctx.bezierCurveTo(987.07, 1334.81, 986.49, 1335.38, 986.49, 1336.05);
        ctx.bezierCurveTo(986.49, 1336.73, 987.07, 1337.3, 987.74, 1337.3);
        ctx.lineTo(999.41, 1337.3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1029.29, 1370.11);
        ctx.bezierCurveTo(1029.29, 1370.84, 1029.92, 1371.47, 1030.65, 1371.47);
        ctx.bezierCurveTo(1031.38, 1371.47, 1032, 1370.84, 1032, 1370.11);
        ctx.lineTo(1032, 1354.18);
        ctx.lineTo(1055.33, 1354.18);
        ctx.lineTo(1055.33, 1370.11);
        ctx.bezierCurveTo(1055.33, 1370.84, 1055.96, 1371.47, 1056.69, 1371.47);
        ctx.bezierCurveTo(1057.41, 1371.47, 1058.04, 1370.84, 1058.04, 1370.11);
        ctx.lineTo(1058.04, 1335.95);
        ctx.bezierCurveTo(1058.04, 1335.22, 1057.41, 1334.6, 1056.69, 1334.6);
        ctx.bezierCurveTo(1055.96, 1334.6, 1055.33, 1335.22, 1055.33, 1335.95);
        ctx.lineTo(1055.33, 1351.68);
        ctx.lineTo(1032, 1351.68);
        ctx.lineTo(1032, 1335.95);
        ctx.bezierCurveTo(1032, 1335.22, 1031.38, 1334.6, 1030.65, 1334.6);
        ctx.bezierCurveTo(1029.92, 1334.6, 1029.29, 1335.22, 1029.29, 1335.95);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1076.43, 1371.26);
        ctx.lineTo(1100.23, 1371.26);
        ctx.bezierCurveTo(1100.91, 1371.26, 1101.48, 1370.69, 1101.48, 1370.01);
        ctx.bezierCurveTo(1101.48, 1369.33, 1100.91, 1368.76, 1100.23, 1368.76);
        ctx.lineTo(1077.79, 1368.76);
        ctx.lineTo(1077.79, 1354.13);
        ctx.lineTo(1097.63, 1354.13);
        ctx.bezierCurveTo(1098.31, 1354.13, 1098.88, 1353.55, 1098.88, 1352.88);
        ctx.bezierCurveTo(1098.88, 1352.2, 1098.31, 1351.63, 1097.63, 1351.63);
        ctx.lineTo(1077.79, 1351.63);
        ctx.lineTo(1077.79, 1337.3);
        ctx.lineTo(1099.97, 1337.3);
        ctx.bezierCurveTo(1100.65, 1337.3, 1101.22, 1336.73, 1101.22, 1336.05);
        ctx.bezierCurveTo(1101.22, 1335.38, 1100.65, 1334.8, 1099.97, 1334.8);
        ctx.lineTo(1076.43, 1334.8);
        ctx.bezierCurveTo(1075.7, 1334.8, 1075.08, 1335.43, 1075.08, 1336.16);
        ctx.lineTo(1075.08, 1369.9);
        ctx.bezierCurveTo(1075.08, 1370.63, 1075.7, 1371.26, 1076.43, 1371.26);
        ctx.closePath();
        ctx.fill();

        // p
        ctx.beginPath();
        ctx.moveTo(864, 1399.57);
        ctx.bezierCurveTo(896.75, 1333.91, 964.09, 1288.42, 1043.84, 1288.42);
        ctx.bezierCurveTo(1095.84, 1288.42, 1142.33, 1307.89, 1177.36, 1339.7);
        ctx.moveTo(1243.85, 1491.11);
        ctx.bezierCurveTo(1240.32, 1571.74, 1197.54, 1637.1, 1132.34, 1670.42);
        ctx.lineTo(1042.75, 1489.52);
        ctx.lineTo(965.52, 1674.88);
        ctx.bezierCurveTo(894.37, 1644.78, 842.44, 1572.83, 842.69, 1487.57);
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    function drawBox(ctx) {
        ctx.fillStyle = '#eee';
        ctx.strokeStyle = 'rgba(0,0,0, 0.1)';
        ctx.lineWidth = 1;

        // outside
        ctx.beginPath();
        ctx.moveTo(392.46, 24.99);
        ctx.lineTo(647.3, 15.83);
        ctx.lineTo(1445.66, 16.06);
        ctx.lineTo(1700.5, 24.99);
        ctx.lineTo(1702.14, 119.74);
        ctx.lineTo(1446.84, 141.13);
        ctx.lineTo(1567.91, 145.6);
        ctx.lineTo(1683.34, 148.89);
        ctx.lineTo(1685.92, 960.41);
        ctx.lineTo(1566.26, 960.18);
        ctx.lineTo(1448.72, 977.11);
        ctx.lineTo(1702.85, 989.33);
        ctx.lineTo(1703.08, 1072.79);
        ctx.lineTo(1443.31, 1097.71);
        ctx.lineTo(1555.68, 1099.59);
        ctx.lineTo(1675.34, 1101.94);
        ctx.lineTo(1673.23, 1898.89);
        ctx.lineTo(1559.44, 1906.41);
        ctx.lineTo(1439.08, 1916.05);
        ctx.lineTo(1690.39, 1924.05);
        ctx.lineTo(1691.8, 2017.61);
        ctx.lineTo(1436.49, 2029.37);
        ctx.lineTo(657.17, 2029.6);
        ctx.lineTo(401.86, 2017.14);
        ctx.lineTo(402.8, 1924.05);
        ctx.lineTo(653.88, 1915.82);
        ctx.lineTo(534.45, 1906.41);
        ctx.lineTo(420.2, 1898.42);
        ctx.lineTo(418.09, 1101.23);
        ctx.lineTo(537.75, 1099.59);
        ctx.lineTo(649.65, 1097.94);
        ctx.lineTo(390.11, 1077.02);
        ctx.lineTo(389.64, 985.33);
        ctx.lineTo(644.71, 977.11);
        ctx.lineTo(527.87, 960.41);
        ctx.lineTo(407.74, 959.94);
        ctx.lineTo(410.34, 148.71);
        ctx.lineTo(525.99, 145.12);
        ctx.lineTo(646.83, 141.36);
        ctx.lineTo(391.29, 120.21);
        ctx.closePath();
        //ctx.fill();
        ctx.stroke();

        if (1) {
            // inside
            ctx.beginPath();
            ctx.moveTo(136.7, 421.08);
            ctx.lineTo(200.53, 421.29);
            ctx.lineTo(201.44, 422.66);
            ctx.lineTo(201.44, 426.45);
            ctx.lineTo(198.7, 427.61);
            ctx.lineTo(200.11, 428.48);
            ctx.lineTo(200.2, 467.84);
            ctx.lineTo(197.46, 468.92);
            ctx.lineTo(201.07, 469.21);
            ctx.lineTo(201.03, 473.36);
            ctx.lineTo(198.62, 474.03);
            ctx.lineTo(200.24, 475.44);
            ctx.lineTo(199.66, 513.93);
            ctx.lineTo(200.07, 515.01);
            ctx.lineTo(200.28, 519.25);
            ctx.lineTo(136.9, 519.95);
            ctx.lineTo(136.9, 514.88);
            ctx.lineTo(138.48, 514.26);
            ctx.lineTo(138.15, 474.32);
            ctx.lineTo(136.57, 473.49);
            ctx.lineTo(136.41, 468.96);
            ctx.lineTo(137.28, 467.84);
            ctx.lineTo(137.11, 427.44);
            ctx.lineTo(136.16, 426.32);
            ctx.lineTo(136.24, 421.71);
            ctx.closePath();
            ctx.fillStyle = '#f8f8f8';
            ctx.fill();
            //ctx.stroke();
        }
    }

    function drawCode(ctx) {
        let b = atob('fzbPP8haCHZdV92u+KnbNdN1g5Kt4F9V9QeoRAB9DNKnE+Y7Ao9LAJqbiHVPJWlEFLzjXmCoaaVCSkCIF2aDzbuWtUuQyp1UlM183wECIP4fJ9cJysbIXQX3pWsLwHdFv78gt8r1d/5YAA==');
        let n = ~~Math.sqrt(b.length << 3);
        ctx.save();
        ctx.translate(860, 363);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,400,400);
        ctx.scale(400/n, 400/n);
        ctx.fillStyle = '#111';
        for (let i = 0; i < n*n; ++i)
            (b.charCodeAt(i>>3) & (1<<(i&7))) && ctx.fillRect(i%n, ~~(i/n), 1,1);
        ctx.restore();
    }

    function nomnomnom() {
        let p = arguments;
        let j = p.length;
        let i = 0;
        while (i < j-3) {
            drawIcon(p[0], p[i+1], p[i+2], r0, p[j-1], !(~~(p[j-2]/r0) & (1<<(i>>1))));
            i += 2;
        }
    }

    function drawIcons2(ctx) {
        let x = [746.3089, 1035.853, 850.37091, 1037.5154, 973.3833, 1037.183, 1101.0504, 1037.1829, 1209.4344, 1037.8479, 1318.1509, 1037.1829, 1291.6641625, 584.3123376534795, 261.91810952401005, 583.9847481682456, 369.3622244593757, 584.5521252628984, 491.38113133015105, 585.4399756393353, 619.3438048840713, 585.8334846041078, 746.6644618916989, 585.8749300152126, 870.3767481128386, 1704.9966945, 765.59198, 79.346504, 873.97595, 78.349129, 982.35999, 78.349129, 1097.3933, 79.678986, 1232.7072, 78.68161, 1336.4365, 79.678986, 2376.662059, 1507.4877815913594, 228.55394968059628, 1508.3487463246774, 352.4534233559609, 1508.450968180546, 480.82011265495737, 1506.26750566572, 589.7429659404492, 1509.4001245813167, 715.3420711758099, 1508.1137584281423, 841.7151456124163, 464.9990985 ];
        for (let i = 0; i < 4; ++i) {
            let n = x.length/4;
            let y = x.slice(i*n, (i+1)*n);
            y.unshift(ctx);
            y.push(i);
            nomnomnom.apply(this, y);
        }
    }


    function drawIcons(ctx) {
        function nomnomnom() {
            let p = arguments;
            let j = p.length;
            let r = 51.6665665;
            let i = 0;
            while (i <= j-3) {
                drawIcon(ctx, p[i+0], p[i+1], r, p[j-1], !(~~(p[j-2]/r) & (1<<(i>>1))));
                i += 2;
            }
        }

        let x = [746.3089, 1035.853, 850.37091, 1037.5154, 973.3833, 1037.183, 1101.0504, 1037.1829, 1209.4344, 1037.8479, 1318.1509, 1037.1829, 1291.6641625, 584.3123376534795, 261.91810952401005, 583.9847481682456, 369.3622244593757, 584.5521252628984, 491.38113133015105, 585.4399756393353, 619.3438048840713, 585.8334846041078, 746.6644618916989, 585.8749300152126, 870.3767481128386, 1704.9966945, 765.59198, 79.346504, 873.97595, 78.349129, 982.35999, 78.349129, 1097.3933, 79.678986, 1232.7072, 78.68161, 1336.4365, 79.678986, 2376.662059, 1507.4877815913594, 228.55394968059628, 1508.3487463246774, 352.4534233559609, 1508.450968180546, 480.82011265495737, 1506.26750566572, 589.7429659404492, 1509.4001245813167, 715.3420711758099, 1508.1137584281423, 841.7151456124163, 464.9990985 ];
        for (let i = 0; i < 4; ++i) {
            let n = x.length/4;
            let y = x.slice(i*n, (i+1)*n);
            y.push(i);
            nomnomnom.apply(this, y);
        }
    }

    function drawIcon(ctx, cx, cy, r, angle, closed) {
        ctx.save();

        // transform into place
        ctx.translate(cx, cy);
        ctx.translate(1, 1);
        ctx.scale(r/512, r/512);
        ctx.rotate(angle * Math.PI/2);
        ctx.translate(-512, -512);

        ctx.strokeStyle = ctx.fillStyle = '#e3001b';

        // circle
        ctx.beginPath();
        if (closed) {
            ctx.arc(512, 512, 488.27, 0, 2*Math.PI);
            ctx.closePath();
        } else {
            ctx.moveTo(846.91, 867.31);
            ctx.bezierCurveTo(759.49, 949.75, 641.64, 1000.27, 512, 1000.27);
            ctx.bezierCurveTo(242.33, 1000.27, 23.73, 781.67, 23.73, 512);
            ctx.bezierCurveTo(23.73, 242.34, 242.33, 23.73, 512, 23.73);
            ctx.bezierCurveTo(641.79, 23.73, 759.75, 74.37, 847.2, 156.96);
        }

        ctx.lineWidth = 47.45;
        ctx.lineCap = 'round';
        ctx.stroke();

        // path piece_7
        ctx.beginPath();
        ctx.moveTo(603.94, 306.77);
        ctx.bezierCurveTo(603.94, 320.85, 592.52, 332.27, 578.43, 332.27);
        ctx.bezierCurveTo(564.35, 332.27, 552.93, 320.85, 552.93, 306.77);
        ctx.bezierCurveTo(552.93, 292.68, 564.35, 281.26, 578.43, 281.26);
        ctx.bezierCurveTo(592.52, 281.26, 603.94, 292.68, 603.94, 306.77);
        ctx.closePath();
        ctx.moveTo(695.58, 236.48);
        ctx.bezierCurveTo(695.58, 253.84, 681.51, 267.92, 664.15, 267.92);
        ctx.bezierCurveTo(646.78, 267.92, 632.71, 253.84, 632.71, 236.48);
        ctx.bezierCurveTo(632.71, 219.12, 646.78, 205.04, 664.15, 205.04);
        ctx.bezierCurveTo(681.51, 205.04, 695.58, 219.12, 695.58, 236.48);
        ctx.closePath();
        ctx.moveTo(611.36, 155.81);
        ctx.bezierCurveTo(611.36, 173.66, 596.88, 188.14, 579.03, 188.14);
        ctx.bezierCurveTo(561.17, 188.14, 546.7, 173.66, 546.7, 155.81);
        ctx.bezierCurveTo(546.7, 137.95, 561.17, 123.48, 579.03, 123.48);
        ctx.bezierCurveTo(596.88, 123.48, 611.36, 137.95, 611.36, 155.81);
        ctx.closePath();
        ctx.moveTo(517.34, 425.1);
        ctx.bezierCurveTo(516.23, 280.95, 511.4, 138.58, 516.08, 95.21);
        ctx.bezierCurveTo(518.7, 70.97, 546.37, 72.77, 560.34, 74.55);
        ctx.bezierCurveTo(606.12, 75.56, 730.28, 121.7, 786.63, 172.71);
        ctx.bezierCurveTo(802.49, 187.07, 800.87, 200.89, 779.52, 221.95);
        ctx.bezierCurveTo(752.63, 248.46, 573.24, 430.75, 552.93, 446.16);
        ctx.bezierCurveTo(534.48, 457.59, 518.48, 439.79, 517.34, 425.1);
        ctx.closePath();
        ctx.fill('evenodd');

        // path piece_6
        ctx.beginPath();
        ctx.moveTo(394.76, 335.83);
        ctx.bezierCurveTo(394.76, 349.92, 406.18, 361.34, 420.27, 361.34);
        ctx.bezierCurveTo(434.35, 361.34, 445.77, 349.92, 445.77, 335.83);
        ctx.bezierCurveTo(445.77, 321.75, 434.35, 310.33, 420.27, 310.33);
        ctx.bezierCurveTo(406.18, 310.33, 394.76, 321.75, 394.76, 335.83);
        ctx.closePath();
        ctx.moveTo(282.65, 216.78);
        ctx.bezierCurveTo(282.65, 234.14, 296.73, 248.21, 314.09, 248.21);
        ctx.bezierCurveTo(331.45, 248.21, 345.53, 234.14, 345.53, 216.78);
        ctx.bezierCurveTo(345.53, 199.41, 331.45, 185.34, 314.09, 185.34);
        ctx.bezierCurveTo(296.73, 185.34, 282.65, 199.41, 282.65, 216.78);
        ctx.closePath();
        ctx.moveTo(390.9, 228.77);
        ctx.bezierCurveTo(390.9, 246.62, 405.38, 261.09, 423.23, 261.09);
        ctx.bezierCurveTo(441.08, 261.09, 455.56, 246.62, 455.56, 228.77);
        ctx.bezierCurveTo(455.56, 210.91, 441.08, 196.44, 423.23, 196.44);
        ctx.bezierCurveTo(405.38, 196.44, 390.9, 210.91, 390.9, 228.77);
        ctx.closePath();
        ctx.moveTo(491.44, 423.92);
        ctx.bezierCurveTo(492.55, 279.76, 497.38, 137.4, 492.7, 94.03);
        ctx.bezierCurveTo(490.09, 69.78, 462.42, 71.59, 448.44, 73.36);
        ctx.bezierCurveTo(402.67, 74.37, 278.5, 120.52, 222.15, 171.53);
        ctx.bezierCurveTo(206.3, 185.88, 207.91, 199.7, 229.27, 220.76);
        ctx.bezierCurveTo(256.15, 247.27, 435.55, 429.56, 455.85, 444.97);
        ctx.bezierCurveTo(474.31, 456.4, 490.3, 438.6, 491.44, 423.92);
        ctx.closePath();
        ctx.fill('evenodd');

        // path piece_5
        ctx.beginPath();
        ctx.moveTo(309.2, 415.27);
        ctx.bezierCurveTo(323.29, 415.27, 334.71, 426.69, 334.71, 440.78);
        ctx.bezierCurveTo(334.71, 454.87, 323.29, 466.29, 309.2, 466.29);
        ctx.bezierCurveTo(295.11, 466.29, 283.69, 454.87, 283.69, 440.78);
        ctx.bezierCurveTo(283.69, 426.69, 295.11, 415.27, 309.2, 415.27);
        ctx.closePath();
        ctx.moveTo(195.02, 296.35);
        ctx.bezierCurveTo(212.38, 296.35, 226.45, 310.42, 226.45, 327.78);
        ctx.bezierCurveTo(226.45, 345.15, 212.38, 359.22, 195.02, 359.22);
        ctx.bezierCurveTo(177.65, 359.22, 163.58, 345.15, 163.58, 327.78);
        ctx.bezierCurveTo(163.58, 310.42, 177.65, 296.35, 195.02, 296.35);
        ctx.closePath();
        ctx.moveTo(190.87, 413.79);
        ctx.bezierCurveTo(208.72, 413.79, 223.19, 428.26, 223.19, 446.12);
        ctx.bezierCurveTo(223.19, 463.97, 208.72, 478.45, 190.87, 478.45);
        ctx.bezierCurveTo(173.01, 478.45, 158.54, 463.97, 158.54, 446.12);
        ctx.bezierCurveTo(158.54, 428.26, 173.01, 413.79, 190.87, 413.79);
        ctx.closePath();
        ctx.moveTo(415.67, 500.1);
        ctx.bezierCurveTo(271.52, 501.2, 129.15, 506.03, 85.78, 501.35);
        ctx.bezierCurveTo(61.54, 498.74, 63.34, 471.07, 65.12, 457.09);
        ctx.bezierCurveTo(66.13, 411.32, 112.27, 287.15, 163.28, 230.8);
        ctx.bezierCurveTo(177.64, 214.95, 191.46, 216.57, 212.52, 237.92);
        ctx.bezierCurveTo(239.03, 264.8, 421.32, 444.2, 436.73, 464.51);
        ctx.bezierCurveTo(448.16, 482.96, 430.36, 498.95, 415.67, 500.1);
        ctx.closePath();
        ctx.fill('evenodd');

        // path piece_4
        ctx.beginPath();
        ctx.moveTo(294.82, 615.42);
        ctx.bezierCurveTo(308.91, 615.42, 320.33, 604, 320.33, 589.92);
        ctx.bezierCurveTo(320.33, 575.83, 308.91, 564.41, 294.82, 564.41);
        ctx.bezierCurveTo(280.73, 564.41, 269.31, 575.83, 269.31, 589.92);
        ctx.bezierCurveTo(269.31, 604, 280.73, 615.42, 294.82, 615.42);
        ctx.closePath();
        ctx.moveTo(206.92, 710.42);
        ctx.bezierCurveTo(224.28, 710.42, 238.35, 696.35, 238.35, 678.98);
        ctx.bezierCurveTo(238.35, 661.62, 224.28, 647.55, 206.92, 647.55);
        ctx.bezierCurveTo(189.55, 647.55, 175.48, 661.62, 175.48, 678.98);
        ctx.bezierCurveTo(175.48, 696.35, 189.55, 710.42, 206.92, 710.42);
        ctx.closePath();
        ctx.moveTo(148.89, 622);
        ctx.bezierCurveTo(166.75, 622, 181.22, 607.53, 181.22, 589.67);
        ctx.bezierCurveTo(181.22, 571.82, 166.75, 557.35, 148.89, 557.35);
        ctx.bezierCurveTo(131.04, 557.35, 116.57, 571.82, 116.57, 589.67);
        ctx.bezierCurveTo(116.57, 607.53, 131.04, 622, 148.89, 622);
        ctx.closePath();
        ctx.moveTo(418.19, 522.11);
        ctx.bezierCurveTo(274.03, 521, 131.67, 516.18, 88.3, 520.85);
        ctx.bezierCurveTo(64.05, 523.47, 65.86, 551.14, 67.63, 565.12);
        ctx.bezierCurveTo(68.65, 610.89, 114.79, 735.06, 165.8, 791.41);
        ctx.bezierCurveTo(180.15, 807.26, 193.98, 805.64, 215.03, 784.29);
        ctx.bezierCurveTo(241.54, 757.4, 423.83, 578.01, 439.25, 557.7);
        ctx.bezierCurveTo(450.68, 539.25, 432.87, 523.26, 418.19, 522.11);
        ctx.closePath();
        ctx.fill('evenodd');

        // path piece_3
        ctx.beginPath();
        ctx.moveTo(408.97, 687.41);
        ctx.bezierCurveTo(408.97, 673.32, 420.38, 661.9, 434.47, 661.9);
        ctx.bezierCurveTo(448.56, 661.9, 459.98, 673.32, 459.98, 687.41);
        ctx.bezierCurveTo(459.98, 701.5, 448.56, 712.92, 434.47, 712.92);
        ctx.bezierCurveTo(420.38, 712.92, 408.97, 701.5, 408.97, 687.41);
        ctx.closePath();
        ctx.moveTo(285.03, 811.39);
        ctx.bezierCurveTo(285.03, 794.02, 299.1, 779.95, 316.46, 779.95);
        ctx.bezierCurveTo(333.83, 779.95, 347.9, 794.02, 347.9, 811.39);
        ctx.bezierCurveTo(347.9, 828.75, 333.83, 842.82, 316.46, 842.82);
        ctx.bezierCurveTo(299.1, 842.82, 285.03, 828.75, 285.03, 811.39);
        ctx.closePath();
        ctx.moveTo(390.65, 796.01);
        ctx.bezierCurveTo(390.65, 778.15, 405.12, 763.68, 422.97, 763.68);
        ctx.bezierCurveTo(440.83, 763.68, 455.3, 778.15, 455.3, 796.01);
        ctx.bezierCurveTo(455.3, 813.86, 440.83, 828.33, 422.97, 828.33);
        ctx.bezierCurveTo(405.12, 828.33, 390.65, 813.86, 390.65, 796.01);
        ctx.closePath();
        ctx.moveTo(492.63, 600.11);
        ctx.bezierCurveTo(493.74, 744.27, 498.57, 886.63, 493.89, 930);
        ctx.bezierCurveTo(491.27, 954.25, 463.6, 952.44, 449.63, 950.67);
        ctx.bezierCurveTo(403.85, 949.66, 279.69, 903.51, 223.34, 852.5);
        ctx.bezierCurveTo(207.48, 838.15, 209.1, 824.33, 230.45, 803.27);
        ctx.bezierCurveTo(257.34, 776.76, 436.73, 594.47, 457.04, 579.05);
        ctx.bezierCurveTo(475.49, 567.63, 491.49, 585.43, 492.63, 600.11);
        ctx.closePath();
        ctx.fill('evenodd');

        // path piece_2
        ctx.beginPath();
        ctx.moveTo(604.53, 689.38);
        ctx.bezierCurveTo(604.53, 675.3, 593.11, 663.88, 579.03, 663.88);
        ctx.bezierCurveTo(564.94, 663.88, 553.52, 675.3, 553.52, 689.38);
        ctx.bezierCurveTo(553.52, 703.47, 564.94, 714.89, 579.03, 714.89);
        ctx.bezierCurveTo(593.11, 714.89, 604.53, 703.47, 604.53, 689.38);
        ctx.closePath();
        ctx.moveTo(671.86, 778.65);
        ctx.bezierCurveTo(671.86, 761.29, 657.78, 747.22, 640.42, 747.22);
        ctx.bezierCurveTo(623.06, 747.22, 608.98, 761.29, 608.98, 778.65);
        ctx.bezierCurveTo(608.98, 796.02, 623.06, 810.09, 640.42, 810.09);
        ctx.bezierCurveTo(657.78, 810.09, 671.86, 796.02, 671.86, 778.65);
        ctx.closePath();
        ctx.moveTo(626.78, 866.44);
        ctx.bezierCurveTo(626.78, 848.59, 612.3, 834.11, 594.45, 834.11);
        ctx.bezierCurveTo(576.6, 834.11, 562.12, 848.59, 562.12, 866.44);
        ctx.bezierCurveTo(562.12, 884.29, 576.6, 898.77, 594.45, 898.77);
        ctx.bezierCurveTo(612.3, 898.77, 626.78, 884.29, 626.78, 866.44);
        ctx.closePath();
        ctx.moveTo(520.9, 600.11);
        ctx.bezierCurveTo(519.79, 744.27, 514.96, 886.63, 519.64, 930);
        ctx.bezierCurveTo(522.26, 954.25, 549.93, 952.44, 563.9, 950.67);
        ctx.bezierCurveTo(609.68, 949.66, 733.84, 903.51, 790.19, 852.5);
        ctx.bezierCurveTo(806.05, 838.15, 804.43, 824.33, 783.07, 803.27);
        ctx.bezierCurveTo(756.19, 776.76, 576.79, 594.47, 556.49, 579.05);
        ctx.bezierCurveTo(538.04, 567.63, 522.04, 585.43, 520.9, 600.11);
        ctx.closePath();
        ctx.fill('evenodd');

        if (closed) {
            // path piece_1
            ctx.beginPath();
            ctx.moveTo(710.15, 612.31);
            ctx.bezierCurveTo(696.07, 612.31, 684.65, 600.89, 684.65, 586.81);
            ctx.bezierCurveTo(684.65, 572.72, 696.07, 561.3, 710.15, 561.3);
            ctx.bezierCurveTo(724.24, 561.3, 735.66, 572.72, 735.66, 586.81);
            ctx.bezierCurveTo(735.66, 600.89, 724.24, 612.31, 710.15, 612.31);
            ctx.closePath();
            ctx.moveTo(821.37, 734.21);
            ctx.bezierCurveTo(804.01, 734.21, 789.93, 720.13, 789.93, 702.77);
            ctx.bezierCurveTo(789.93, 685.41, 804.01, 671.33, 821.37, 671.33);
            ctx.bezierCurveTo(838.73, 671.33, 852.81, 685.41, 852.81, 702.77);
            ctx.bezierCurveTo(852.81, 720.13, 838.73, 734.21, 821.37, 734.21);
            ctx.closePath();
            ctx.moveTo(826.71, 616.76);
            ctx.bezierCurveTo(808.85, 616.76, 794.38, 602.29, 794.38, 584.44);
            ctx.bezierCurveTo(794.38, 566.58, 808.85, 552.11, 826.71, 552.11);
            ctx.bezierCurveTo(844.56, 552.11, 859.04, 566.58, 859.04, 584.44);
            ctx.bezierCurveTo(859.04, 602.29, 844.56, 616.76, 826.71, 616.76);
            ctx.closePath();
            ctx.moveTo(603.09, 526.31);
            ctx.bezierCurveTo(747.24, 525.2, 889.61, 520.37, 932.98, 525.05);
            ctx.bezierCurveTo(957.22, 527.66, 955.42, 555.34, 953.64, 569.31);
            ctx.bezierCurveTo(952.63, 615.08, 906.49, 739.25, 855.48, 795.6);
            ctx.bezierCurveTo(841.12, 811.46, 827.3, 809.84, 806.24, 788.48);
            ctx.bezierCurveTo(779.73, 761.6, 597.44, 582.2, 582.03, 561.9);
            ctx.bezierCurveTo(570.6, 543.44, 588.4, 527.45, 603.09, 526.31);
            ctx.closePath();
            ctx.fill('evenodd');

            // path piece_0
            ctx.beginPath();
            ctx.moveTo(729.83, 413.88);
            ctx.bezierCurveTo(715.74, 413.88, 704.32, 425.3, 704.32, 439.39);
            ctx.bezierCurveTo(704.32, 453.48, 715.74, 464.9, 729.83, 464.9);
            ctx.bezierCurveTo(743.91, 464.9, 755.33, 453.48, 755.33, 439.39);
            ctx.bezierCurveTo(755.33, 425.3, 743.91, 413.88, 729.83, 413.88);
            ctx.closePath();
            ctx.moveTo(820.28, 316.31);
            ctx.bezierCurveTo(802.92, 316.31, 788.85, 330.38, 788.85, 347.75);
            ctx.bezierCurveTo(788.85, 365.11, 802.92, 379.18, 820.28, 379.18);
            ctx.bezierCurveTo(837.65, 379.18, 851.72, 365.11, 851.72, 347.75);
            ctx.bezierCurveTo(851.72, 330.38, 837.65, 316.31, 820.28, 316.31);
            ctx.closePath();
            ctx.moveTo(874.86, 414.77);
            ctx.bezierCurveTo(857, 414.77, 842.53, 429.25, 842.53, 447.1);
            ctx.bezierCurveTo(842.53, 464.96, 857, 479.43, 874.86, 479.43);
            ctx.bezierCurveTo(892.71, 479.43, 907.18, 464.96, 907.18, 447.1);
            ctx.bezierCurveTo(907.18, 429.25, 892.71, 414.77, 874.86, 414.77);
            ctx.closePath();
            ctx.moveTo(601.41, 503.45);
            ctx.bezierCurveTo(745.57, 504.56, 887.93, 509.39, 931.3, 504.71);
            ctx.bezierCurveTo(955.54, 502.09, 953.74, 474.42, 951.97, 460.45);
            ctx.bezierCurveTo(950.95, 414.67, 904.81, 290.51, 853.8, 234.16);
            ctx.bezierCurveTo(839.45, 218.3, 825.62, 219.92, 804.57, 241.27);
            ctx.bezierCurveTo(778.05, 268.16, 595.77, 447.56, 580.35, 467.86);
            ctx.bezierCurveTo(568.92, 486.31, 586.73, 502.31, 601.41, 503.45);
            ctx.closePath();
            ctx.fill('evenodd');
        }

        ctx.restore();
    }
}

function lerp(a, b, x) {
    return (1 - x) * a + x * b;
}

function clamp(x, a, b) {
    if (x < a) return a;
    else if (x > b) return b;
    else return x;
}
