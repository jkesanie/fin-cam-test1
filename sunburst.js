// Function to convert markdown-style lists to HTML
function markdownToHtml(markdown) {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  let html = '<ul>';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      html += `<li>${trimmed.substring(1).trim()}</li>`;
    } else if (trimmed.length > 0) {
      html += `<li>${trimmed}</li>`;
    }
  }
  html += '</ul>';
  return html;
}

let isZooming = false;

chart = (data) => {
  // Specify the chart's dimensions.
  const width = 928;
  const height = width;
  const radius = width / 6;

  // Create the color scale.
  // Use custom colors from data if available, otherwise generate from rainbow
  const colors = {};
  const getColor = (d) => {
    if (d.color) return d.color;
    if (colors[d.name]) return colors[d.name];
    // Generate color based on name hash for consistency
    let hash = 0;
    for (let i = 0; i < d.name.length; i++) {
      hash = d.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % 10;
    const palette = d3.quantize(d3.interpolateRainbow, 11);
    colors[d.name] = palette[index];
    return colors[d.name];
  };
  const color = d3.scaleOrdinal().range(Object.values(colors));

  // Compute the layout.
  const hierarchy = d3.hierarchy(data)
      .sum(d => d.value !== undefined ? d.value : 1)
      .sort((a, b) => b.value - a.value);
  const root = d3.partition()
      .size([2 * Math.PI, hierarchy.height + 1])
    (hierarchy);
  root.each(d => d.current = d);

  // Create the arc generator.
  const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius * 1.5)
      .innerRadius(d => d.y0 * radius)
      .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1))

  // Create the SVG container.
  const svg = d3.create("svg")
      .attr("viewBox", [-width / 2, -height / 2, width, width])
      .style("font", "10px sans-serif");

  // Append the arcs.
  const path = svg.append("g")
    .selectAll("path")
    .data(root.descendants().slice(1))
    .join("path")
      .attr("fill", d => { 
        let parent = d;
        while (parent.depth > 1) parent = parent.parent;
        return getColor(parent.data);
      })
      .attr("fill-opacity", d => arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0)
      .attr("pointer-events", d => arcVisible(d.current) ? "auto" : "none")
      .attr("d", d => arc(d.current));

  // Get or create tooltip element (create only once)
  let tooltip = document.getElementById("tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "tooltip";
    tooltip.style.display = "none";
    tooltip.style.position = "fixed";
    tooltip.style.background = "rgba(0, 0, 0, 0.85)";
    tooltip.style.color = "#fff";
    tooltip.style.padding = "12px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.fontSize = "13px";
    tooltip.style.zIndex = "1000";
    tooltip.style.pointerEvents = "none";
    tooltip.style.maxWidth = "300px";
    tooltip.style.wordWrap = "break-word";
    tooltip.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
    document.body.appendChild(tooltip);
  }

  // Attach directly to the path selection for nodes with description
  path.filter(d => d.data.description)
      .on("mouseover", function(event, d) {
        // Don't show tooltip if zoom is in progress
        if (isZooming) return;
        
        const desc = d.data.description;
        let tooltipContent = `<div style="font-family: sans-serif; padding: 8px;">`;
        if (desc.subcategory) {
          tooltipContent += `<strong>${desc.subcategory}</strong><br/><br/>`;
        }
        if (desc.desc_quantitative) {
          tooltipContent += `<strong>Quantitative:</strong><br/>${markdownToHtml(desc.desc_quantitative)}`;
        }
        if (desc.desc_qualitative) {
          if (desc.desc_quantitative) tooltipContent += `<br/><br/>`;
          tooltipContent += `<strong>Qualitative:</strong><br/>${markdownToHtml(desc.desc_qualitative)}`;
        }
        tooltipContent += `</div>`;
        
        tooltip.innerHTML = tooltipContent;
        tooltip.style.display = "block";
        
        // Position tooltip next to cursor with small offset
        const offsetX = 15;
        const offsetY = 15;
        const x = event.clientX + offsetX;
        const y = event.clientY + offsetY;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";

      })
      .on("mouseout", function(event) {
        tooltip.style.display = "none";
      })
      .on("mousemove", function(event) {
        // Update tooltip position to follow cursor
        const offsetX = 15;
        const offsetY = 15;
        const x = event.clientX + offsetX;
        const y = event.clientY + offsetY;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
      });

  // Make them clickable if they have children.
  path.filter(d => d.children)
      .style("cursor", "pointer")
      .on("click", clicked);

  // Helper to check if zoom is in progress
  function isZoomInProgress() {
    return isZooming;
  }

  const format = d3.format(",d");
  path.append("title")
      .text(d => {
        const tooltip = d.data.tooltip;
        if (tooltip) return tooltip;
        return `${d.ancestors().map(d => d.data.name).reverse().join("/")}\n${format(d.value)}`;
      });

  // Helper function to measure text width using an offscreen SVG
  function measureTextWidth(text, fontSize = 10) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontSize}px sans-serif`;
    return context.measureText(text).width;
  }

  // Helper function to wrap text by words
  function wrapText(textElement, text, maxWidth) {
    const words = text.split(/\s+/);
    let lines = [];
    let currentLine = words[0] || '';
    
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + ' ' + word;
      textElement.textContent = testLine;
      const testWidth = measureTextWidth(testLine);
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  const label = svg.append("g")
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle")
      .style("user-select", "none")
    .selectAll("text")
    .data(root.descendants().slice(1))
    .join("text")
      .attr("fill-opacity", d => +labelVisible(d.current))
      .attr("transform", d => labelTransform(d.current))
      .each(function(d) {
        if (d.data.hideName) return;
        
        const textElement = this;
        const sectorWidth = (d.y1 - d.y0) * radius - 20;
        const availableWidth = Math.min(sectorWidth, 100);
        console.log(availableWidth)
        
        const textWidth = measureTextWidth(d.data.name);
        console.log(textWidth);
        
        if (textWidth <= availableWidth) {
          // No wrapping needed
          textElement.textContent = d.data.name;
        } else {
          // Create tspans for wrapped text
          textElement.textContent = '';
          
          const words = d.data.name.split(/\s+/);
          let lines = [];
          let currentLine = words[0] || '';
          
          for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + ' ' + word;
            const testWidth = measureTextWidth(testLine);
            if (testWidth <= availableWidth) {
              currentLine = testLine;
            } else {
              lines.push(currentLine);
              currentLine = word;
            }
          }
          lines.push(currentLine);
          
          lines.forEach((line, i) => {
            const tspan = textElement.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "tspan"));
            tspan.textContent = line;
            tspan.setAttribute("x", 0);
            tspan.setAttribute("dy", i === 0 ? "0.35em" : "1.1em");
          });
        }
      });

  const parent = svg.append("circle")
      .datum(root)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("click", clicked);

  // Handle zoom on click.
  function clicked(event, p) {
    isZooming = true;
    parent.datum(p.parent || root);

    root.each(d => d.target = {
      x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      y0: Math.max(0, d.y0 - p.depth),
      y1: Math.max(0, d.y1 - p.depth)
    });

    const t = svg.transition().duration(event.altKey ? 7500 : 750);

    // Transition the data on all arcs, even the ones that aren't visible,
    // so that if this transition is interrupted, entering arcs will start
    // the next transition from the desired position.
    const pathTrans = path.transition(t)
        .tween("data", d => {
          const i = d3.interpolate(d.current, d.target);
          return t => d.current = i(t);
        })
      .filter(function(d) {
        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
      })
        .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
        .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none") 

        .attrTween("d", d => () => arc(d.current));

    const labelTrans = label.filter(function(d) {
        return +this.getAttribute("fill-opacity") || labelVisible(d.target);
      }).transition(t)
        .attr("fill-opacity", d => +labelVisible(d.target))
        .attrTween("transform", d => () => labelTransform(d.current));

    // Reset isZooming flag when transition completes (using timeout matching duration)
    const duration = t.duration();
    setTimeout(() => {
      isZooming = false;
    }, duration);
  }
  
  function arcVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d) {
    // Show labels only on the inner circle (depth 1, where y0 >= 1 and y1 <= 2)
    return d.y0 >= 1 && d.y1 <= 2 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
  }

  function labelTransform(d) {
    const angleRad = (d.x0 + d.x1) / 2 - Math.PI / 2;  // subtract 90° (π/2) offset
    const y = (d.y0 + d.y1) / 2 * radius;
    const x = Math.cos(angleRad) * y;
    const newY = Math.sin(angleRad) * y;
    return `translate(${x},${newY})`;
  }

  return svg.node();
}
