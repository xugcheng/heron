/**
 * Code for drawing the connected circles that make up the logical plan for this topology.
 * Exports a single global function drawLogicalPlan.
 */
(function (global) {
  function htmlDecode(input){
    var e = document.createElement('div');
    e.innerHTML = input;
    return e.childNodes.length === 0 ? "" : e.childNodes[0].nodeValue;
  }

  var sleep = function(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() < start + delay);
  };

  // Rearrage nodes in the groups so that
  // the number of intersections of edges
  // is minimized.
  // Ideally, there should be no intersections,
  // but if that is not achievable, rearrage
  // so as to have minimum intersections.
  var minimizeIntersections = function (groups) {
    // First assign group level index.
    // Also set the source group level indices.
    for (var i = 0; i < groups.length; i++) {
      for (var j = 0; j < groups[i].length; j++) {
        groups[i][j].groupsLevelIndex = j;
        for (var e = 0; e < groups[i][j].edges.length; e++) {
          var node = groups[i][j].edges[e].target;
          if (node.sourceGroupsLevelIndices === undefined) {
            node.sourceGroupsLevelIndices = [];
          }
          node.sourceGroupsLevelIndices.push(j);
        }
      }
    }

    var compare = function (a, b) {
      var aIndices = a.sourceGroupsLevelIndices;
      var bIndices = b.sourceGroupsLevelIndices;
      var sumA = 0;
      var sumB = 0;
      for (var i = 0; i < aIndices.length; i++) {
        sumA += aIndices[i];
      }
      for (var i = 0; i < bIndices.length; i++) {
        sumB += bIndices[i];
      }
      var avgA = sumA / aIndices.length;
      var avgB = sumB / bIndices.length;

      return avgA - avgB;
    }

    // Sort individual groups based on avg sourceGroupsLevelIndices.
    // Don't forget to update its own groupLevelIndex and
    // next level nodes' sourceGroupsLevelIndices.
    // Need to start from 1, since 0 level nodes won't have
    // any sourceGroupsLevelIndices.
    for (var i = 1; i < groups.length; i++) {
      groups[i].sort(compare);
      for (var j = 0; j < groups[i].length; j++) {
        groups[i][j].groupsLevelIndex = j;
        // Reset the next level's sourceGroupsLevelIndices.
        for (var e = 0; e < groups[i][j].edges.length; e++) {
          groups[i][j].edges[e].target.sourceGroupsLevelIndices = undefined;
        }
      }
      for (var j = 0; j < groups[i].length; j++) {
        groups[i][j].groupsLevelIndex = j;
        // Now set those values again.
        for (var e = 0; e < groups[i][j].edges.length; e++) {
          var node = groups[i][j].edges[e].target;
          if (node.sourceGroupsLevelIndices === undefined) {
            node.sourceGroupsLevelIndices = [];
          }
          node.sourceGroupsLevelIndices.push(j);
        }
      }
    }
    return groups;
  };

  // Sort the graph topologically
  // and also add virual nodes.
  var groupify = _.memoize(function (nodes, links) {

    nodes.forEach(function (node) {
        node.isReal = true;
    });

    var numNodes = nodes.length;

    var nodesToLinks = {};
    links.forEach(function (l) {
      if (!(l.source.name in nodesToLinks)) {
        nodesToLinks[l.source.name] = [];
      }
      nodesToLinks[l.source.name].push(l);
    });

    nodes.forEach(function (node) {
      var nextLinks = nodesToLinks[node.name];
      if (nextLinks) {
        node.edges = nodesToLinks[node.name];
      } else {
        node.edges = [];
      }
    });

    // Find the first elements
    var group = nodes.filter(function (node) {
      return links.every(function (link) {
        return node !== link.target;
      });
    });

    var groupIndex = 0;
    group.forEach(function (node) {
      node.groupIndex = groupIndex;
    });

    groupIndex++;
    var toProcess = [];
    var nextLinks = group.map(function (node) {
      return nodesToLinks[node.name];
    });

    nextLinks.forEach(function (arr) {
      toProcess = toProcess.concat(arr);
    });

    while (toProcess.length > 0) {

      // In case of circular graphs, this will prevent infinte loop
      if (groupIndex > numNodes) {
        break;
      }

      group = toProcess.map(function (link) {
        return link.target;
      });

      group.forEach(function (node) {
        node.groupIndex = groupIndex;
      });

      nextLinks = group.map(function (node) {
        if (node.name in nodesToLinks) {
          return nodesToLinks[node.name];
        } else {
          return [];
        }
      });

      toProcess = [];
      if (nextLinks.length > 0) {
        nextLinks.forEach(function (arr) {
          toProcess = toProcess.concat(arr);
        });
      }
      groupIndex++;
    }

    var groups = Array.apply(null, new Array(groupIndex)).map(function (x) { return []; });

    nodes.forEach(function (node) {
      groups[node.groupIndex].push(node);
    });

    console.warn("done groupifying");
    console.warn("adding virtual nodes");

    for (var i = 0; i < groups.length; i++) {
      group = groups[i];
      group.forEach(function (node) {

        var edges = node.edges;
        edges.forEach(function (edge) {

          var diff = edge.target.groupIndex - node.groupIndex;
          if (diff > 1) {

            var newNode = {
              "groupIndex": i + 1,
              "edges": [],
              "isReal": false
            };

            newNode.edges.push({
              "source": newNode,
              "target": edge.target
            });

            edge.target = newNode;
            groups[i+1].push(newNode);
          }
        });
      });
    }

    console.warn("done adding virtual nodes");
    var goodGroups = minimizeIntersections(groups);
    return goodGroups;
  });

  // TODO: Too long function. Will Refactor.
  function drawLogicalPlan(planController, topology, id, outerWidth, outerHeight,
          cluster, environ, toponame) {

    id = id === undefined ? "#content" : id;
    outerWidth = outerWidth === undefined ? 1000 : outerWidth;
    outerHeight = outerHeight === undefined ? 300 : outerHeight;

    var padding = {
      top: 50,
      left: 30,
      right: 30,
      bottom: 50
    };

    var height = outerHeight - padding.top - padding.bottom;
    var width = outerWidth - padding.left - padding.right;

    // create the svg
    var outerSvg = d3.select(id).text("")
              .append("svg")
                .attr("width", outerWidth)
                .attr("height", outerHeight)
                .attr("id", "topology");
    var svg = outerSvg.append("g")
                .attr("tranform", "translate(" + padding.left + "," + padding.top + ")");

    spoutsArr = [];
    boltsArr = [];

    // create the spout array
    for (var i in topology.spouts) {
      spoutsArr.push({
        "name": i
      });
    }

    // create the bolt array
    for (var i in topology.bolts) {
      boltsArr.push({
          "name": i,
          "inputComponents": topology.bolts[i]["inputComponents"]
      });
    }

    var nodes = spoutsArr.concat(boltsArr)
    var links = [];

    for (var b in boltsArr) {
      for (w in nodes) {
        if (boltsArr[b].inputComponents.indexOf(nodes[w].name) >= 0) {
          links.push({
            "source": nodes[w],
            "target": boltsArr[b]
          });
        }
      }
    }

    var sptblt = Object.keys(topology.spouts)
                       .concat(Object.keys(topology.bolts));

    var color = d3.scale.ordinal().domain(sptblt.sort()).range(colors);

    // Groupify
    var groups = groupify(nodes, links);

    // Done groupifying
    nodes = [];
    links = [];
    groups.forEach(function (group) {
      group.forEach(function (node) {
        nodes.push(node);
        node.edges.forEach(function (edge) {
          links.push(edge);
        });
      });
    });

    // layout using force directed graph
    var force = d3.layout.force()
                  .gravity(0.05)
                  .distance(100)
                  .charge(-1000)
                  .size([width, height]);

    force.nodes(nodes)
         .links(links)
         .linkDistance(200)
         .start();

    hOffset = 1.0 / (groups.length + 0.618);

    nodes.forEach(function (node) {
      var x = hOffset * (node.groupIndex + 1);
      var group = groups[node.groupIndex];
      var vOffset = 1.0 / (group.length + 1);
      var y = vOffset * (group.indexOf(node) + 1);
      // Interpolate it with lesser width
      // to account for nodes that are
      // in the extreme right. Otherwise, those
      // nodes would sometimes not respond to
      // hover function.
      node.x = d3.interpolate(0, width)(x);
      node.y = d3.interpolate(0, height)(y);
    });

    var yRange = d3.extent(nodes, function (d) { return d.y; });
    outerSvg.attr('height', (yRange[1] - yRange[0]) + padding.top + padding.bottom);
    svg.attr('transform', 'translate(' + padding.left + ',' + (padding.top - yRange[0]) + ')')


    var node = svg.selectAll(".topnode")
                  .data(nodes)
                  .enter()
                  .append("g")
                  .attr("class", "topnode")
                  .style("fill", "black");

    node.each(function (n) {
      d3.select(this)
        .selectAll(".link")
        .data(n.edges)
        .enter()
        .append("path")
        .attr('class', 'link')
        .attr("stroke-width", linestyle.width)
        .attr("stroke", linestyle.color)
        .attr("fill", "none")
        .attr("d", function (edge) {
          var p0 = edge.source;
          var p3 = edge.target;
          var m = (p0.x + p3.x) / 2;
          var p = [p0, {x: m, y: p0.y}, {x: m, y: p3.y}, p3];
          return "M" + p[0].x + " " + p[0].y +
                 "C" + p[1].x + " " + p[1].y +
                 " " + p[2].x + " " + p[2].y +
                 " " + p[3].x + " " + p[3].y;
        });
    });

    node.append("circle")
        .attr('class', 'background')
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; })
        .attr("r", function (d) {
          if (d.isReal) {
            return d.r = 17;
          }
          return d.r = 0;
        })
        .style('fill', 'white');

    node.append("circle")
        .attr("class", "node")
        .attr("cx", function (d) { return d.cx = d.x; })
        .attr("cy", function (d) { return d.cy = d.y; })
        .attr("r", function (d) {
          if (d.isReal) {
            return d.r = 15;
          }
          return d.r = 0;
        })
        .style("stroke", linestyle.color)
        .style("stroke-width", linestyle.width)
        .style('fill', function (d) {
          d.defaultColor = color(d.name);
          d.color = d.color || d.defaultColor;
          return d.color;
        })
        .on("click", planController.logicalComponentClicked)
        .on("mouseover", planController.logicalComponentHoverOver)
        .on("mouseout", planController.logicalComponentHoverOut);

    node.append("text")
        .attr("id", function(d) { return "text+" + d.name; })
        .attr("x", function (d) { return d.cx; })
        .attr("y", function (d) { return d.cy - d.r - 10; })
        .attr("class", "fade")
        .style("text-anchor", "middle")
        .text(function (d) {
          if (d.isReal) {
            return d.name;
          }
          return "";
        });
  }

  global.drawLogicalPlan = drawLogicalPlan;
}(this));
